import { LIMITS } from "@/lib/constants";
import { daysSince, parseDateOnly, toDateOnly } from "@/lib/date";

import { prisma } from "@/server/db";
import type { LedgerContext } from "@/server/guards/ledger";
import { AppError } from "@/server/http/errors";
import type { SettlementSummary } from "@/server/mappers/contact.mapper";
import { recordInclude, recordToDto } from "@/server/mappers/record.mapper";

function occurredAtFilter(from?: string, to?: string) {
  if (!from && !to) return {};
  return {
    occurredAt: {
      ...(from ? { gte: parseDateOnly(from) } : {}),
      ...(to ? { lte: parseDateOnly(to) } : {}),
    },
  };
}

/** 按人对账：全部双向流水 + 净差额（实时聚合，不落库） */
export async function getContactSettlement(
  ctx: LedgerContext,
  contactId: string,
  range: { from?: string; to?: string } = {},
) {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, ledgerId: ctx.ledgerId, deletedAt: null },
    select: { id: true, name: true, relationTag: true },
  });
  if (!contact) throw new AppError("NOT_FOUND");

  const where = {
    ledgerId: ctx.ledgerId,
    contactId,
    deletedAt: null,
    ...occurredAtFilter(range.from, range.to),
  };

  const [rows, grouped, unsettled] = await Promise.all([
    prisma.record.findMany({
      where,
      include: recordInclude,
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      take: LIMITS.settlementRecordsMax + 1,
    }),
    prisma.record.groupBy({
      by: ["direction"],
      where,
      _sum: { amountCents: true },
      _count: { _all: true },
      _min: { occurredAt: true },
      _max: { occurredAt: true },
    }),
    prisma.record.aggregate({
      where: { ...where, direction: "RECEIVED", settledAt: null },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
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
    const sum = row._sum.amountCents ?? 0;
    if (row.direction === "GIVEN") {
      givenTotalCents = sum;
      givenCount = row._count._all;
    } else {
      receivedTotalCents = sum;
      receivedCount = row._count._all;
    }

    if (row._min.occurredAt) {
      const day = toDateOnly(row._min.occurredAt);
      if (!firstOccurredAt || day < firstOccurredAt) firstOccurredAt = day;
    }
    if (row._max.occurredAt) {
      const day = toDateOnly(row._max.occurredAt);
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
    unsettledReceivedCount: unsettled._count._all,
    unsettledReceivedCents: unsettled._sum.amountCents ?? 0,
    firstOccurredAt,
    lastOccurredAt,
  };

  return { contact, summary, records, truncated };
}

/** 待回礼：收到且未结清，拖得最久的排最前 */
export async function listPendingReturns(
  ctx: LedgerContext,
  input: { contactId?: string; page: number; pageSize: number },
) {
  const where = {
    ledgerId: ctx.ledgerId,
    deletedAt: null,
    direction: "RECEIVED" as const,
    settledAt: null,
    ...(input.contactId ? { contactId: input.contactId } : {}),
  };

  const [total, rows, aggregate] = await Promise.all([
    prisma.record.count({ where }),
    prisma.record.findMany({
      where,
      include: recordInclude,
      orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.record.aggregate({
      where,
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
  ]);

  return {
    items: rows.map((row) => ({ ...recordToDto(row), daysSince: daysSince(row.occurredAt) })),
    total,
    summary: {
      totalCount: aggregate._count._all,
      totalCents: aggregate._sum.amountCents ?? 0,
    },
  };
}
