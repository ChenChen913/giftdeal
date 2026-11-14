import { and, count, eq, gte, isNull, lte, max, min, sql, sum } from "drizzle-orm";

import { LIMITS } from "@/lib/constants";
import { daysSince, parseDateOnly, toDateOnly } from "@/lib/date";

import { db } from "@/server/db-drizzle";
import type { LedgerContext } from "@/server/guards/ledger";
import { AppError } from "@/server/http/errors";
import type { SettlementSummary } from "@/server/mappers/contact.mapper";
import { recordToDto } from "@/server/mappers/record.mapper";
import { contact, record } from "@/server/schema";

const recordWith = {
  contact: { columns: { id: true, name: true, relationTag: true } },
  settledRecord: { columns: { id: true } },
} as const;

function toCents(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(value);
}

function occurredAtConditions(from?: string, to?: string) {
  const parts = [];
  if (from) parts.push(gte(record.occurredAt, parseDateOnly(from)));
  if (to) parts.push(lte(record.occurredAt, parseDateOnly(to)));
  return parts;
}

/** 按人对账：全部双向流水 + 净差额（实时聚合，不落库） */
export async function getContactSettlement(
  ctx: LedgerContext,
  contactId: string,
  range: { from?: string; to?: string } = {},
) {
  const contactRows = await db
    .select({ id: contact.id, name: contact.name, relationTag: contact.relationTag })
    .from(contact)
    .where(
      and(eq(contact.id, contactId), eq(contact.ledgerId, ctx.ledgerId), isNull(contact.deletedAt)),
    )
    .limit(1);
  const contactRow = contactRows[0];
  if (!contactRow) throw new AppError("NOT_FOUND");

  const where = and(
    eq(record.ledgerId, ctx.ledgerId),
    eq(record.contactId, contactId),
    isNull(record.deletedAt),
    ...occurredAtConditions(range.from, range.to),
  );

  const [rows, grouped, unsettled] = await Promise.all([
    db.query.record.findMany({
      where,
      with: recordWith,
      orderBy: [sql`${record.occurredAt} DESC`, sql`${record.createdAt} DESC`],
      limit: LIMITS.settlementRecordsMax + 1,
    }),
    db
      .select({
        direction: record.direction,
        total: sum(record.amountCents),
        n: count(),
        first: min(record.occurredAt),
        last: max(record.occurredAt),
      })
      .from(record)
      .where(where)
      .groupBy(record.direction),
    db
      .select({ total: sum(record.amountCents), n: count() })
      .from(record)
      .where(and(where, eq(record.direction, "RECEIVED"), isNull(record.settledAt))),
  ]);

  const truncated = rows.length > LIMITS.settlementRecordsMax;
  const records = (truncated ? rows.slice(0, LIMITS.settlementRecordsMax) : rows).map(recordToDto);

  let givenTotalCents = 0;
  let receivedTotalCents = 0;
  let givenCount = 0;
  let receivedCount = 0;
  let firstOccurredAt: string | null = null;
  let lastOccurredAt: string | null = null;

  for (const row of grouped) {
    const total = toCents(row.total);
    if (row.direction === "GIVEN") {
      givenTotalCents = total;
      givenCount = Number(row.n);
    } else {
      receivedTotalCents = total;
      receivedCount = Number(row.n);
    }

    if (row.first) {
      const day = toDateOnly(row.first);
      if (!firstOccurredAt || day < firstOccurredAt) firstOccurredAt = day;
    }
    if (row.last) {
      const day = toDateOnly(row.last);
      if (!lastOccurredAt || day > lastOccurredAt) lastOccurredAt = day;
    }
  }

  const summary: SettlementSummary = {
    givenTotalCents,
    receivedTotalCents,
    netCents: receivedTotalCents - givenTotalCents,
    recordCount: givenCount + receivedCount,
    givenCount,
    receivedCount,
    unsettledReceivedCount: Number(unsettled[0]?.n ?? 0),
    unsettledReceivedCents: toCents(unsettled[0]?.total),
    firstOccurredAt,
    lastOccurredAt,
  };

  return { contact: contactRow, summary, records, truncated };
}

/** 待回礼：收到且未结清，拖得最久的排最前 */
export async function listPendingReturns(
  ctx: LedgerContext,
  input: { contactId?: string; page: number; pageSize: number },
) {
  const conditions = [
    eq(record.ledgerId, ctx.ledgerId),
    isNull(record.deletedAt),
    eq(record.direction, "RECEIVED"),
    isNull(record.settledAt),
  ];
  if (input.contactId) conditions.push(eq(record.contactId, input.contactId));
  const where = and(...conditions);

  const [totalRows, rows, aggregate] = await Promise.all([
    db.select({ n: count() }).from(record).where(where),
    db.query.record.findMany({
      where,
      with: recordWith,
      orderBy: [sql`${record.occurredAt} ASC`, sql`${record.createdAt} ASC`],
      offset: (input.page - 1) * input.pageSize,
      limit: input.pageSize,
    }),
    db.select({ total: sum(record.amountCents), n: count() }).from(record).where(where),
  ]);

  return {
    items: rows.map((row) => ({ ...recordToDto(row), daysSince: daysSince(row.occurredAt) })),
    total: Number(totalRows[0]?.n ?? 0),
    summary: {
      totalCount: Number(aggregate[0]?.n ?? 0),
      totalCents: toCents(aggregate[0]?.total),
    },
  };
}
