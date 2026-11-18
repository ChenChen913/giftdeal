import { and, count, desc, eq, inArray, isNull, max, sum } from "drizzle-orm";

import { SCENE_LABELS, type GiftScene } from "@/lib/constants";
import { parseDateOnly, toDateOnly } from "@/lib/date";

import { db } from "@/server/db-drizzle";
import type { LedgerContext } from "@/server/guards/ledger";
import { AppError } from "@/server/http/errors";
import { recordToDto } from "@/server/mappers/record.mapper";
import { lifeEvent, record } from "@/server/schema";
import type { CreateEventInput, UpdateEventInput } from "@/server/validators/event";

export type EventSummary = {
  givenTotalCents: number;
  receivedTotalCents: number;
  netCents: number;
  recordCount: number;
  /** 参与过这场事的亲友人数（去重） */
  participantCount: number;
  /** 单笔最大收礼，用于「谁给得最重」 */
  maxReceivedCents: number;
};

export type EventDto = {
  id: string;
  ledgerId: string;
  title: string;
  scene: GiftScene;
  sceneLabel: string;
  occurredAt: string;
  location: string | null;
  note: string | null;
  hosted: boolean;
  createdAt: string;
  updatedAt: string;
  summary: EventSummary;
};

const recordWith = {
  contact: { columns: { id: true, name: true, relationTag: true } },
  settledRecord: { columns: { id: true } },
} as const;

function toCents(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(value);
}

function emptySummary(): EventSummary {
  return {
    givenTotalCents: 0,
    receivedTotalCents: 0,
    netCents: 0,
    recordCount: 0,
    participantCount: 0,
    maxReceivedCents: 0,
  };
}

function toDto(
  row: {
    id: string;
    ledgerId: string;
    title: string;
    scene: string;
    occurredAt: Date;
    location: string | null;
    note: string | null;
    hosted: boolean;
    createdAt: Date;
    updatedAt: Date;
  },
  summary: EventSummary,
): EventDto {
  return {
    id: row.id,
    ledgerId: row.ledgerId,
    title: row.title,
    scene: row.scene as GiftScene,
    sceneLabel: SCENE_LABELS[row.scene as GiftScene] ?? row.scene,
    occurredAt: toDateOnly(row.occurredAt),
    location: row.location,
    note: row.note,
    hosted: row.hosted,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    summary,
  };
}

/**
 * 批量算每场事的收送汇总。
 * 用两次聚合查询覆盖全部事件，避免按事件逐条查（N+1）。
 */
async function summaryMap(ledgerId: string, eventIds: string[]) {
  const result = new Map<string, EventSummary>();
  for (const id of eventIds) result.set(id, emptySummary());
  if (eventIds.length === 0) return result;

  const grouped = await db
    .select({
      eventId: record.eventId,
      direction: record.direction,
      total: sum(record.amountCents),
      n: count(),
      maxAmount: max(record.amountCents),
    })
    .from(record)
    .where(
      and(
        eq(record.ledgerId, ledgerId),
        inArray(record.eventId, eventIds),
        isNull(record.deletedAt),
      ),
    )
    .groupBy(record.eventId, record.direction);

  for (const row of grouped) {
    if (!row.eventId) continue;
    const summary = result.get(row.eventId);
    if (!summary) continue;

    const total = toCents(row.total);
    summary.recordCount += Number(row.n);

    if (row.direction === "GIVEN") {
      summary.givenTotalCents += total;
    } else {
      summary.receivedTotalCents += total;
      summary.maxReceivedCents = Math.max(summary.maxReceivedCents, Number(row.maxAmount ?? 0));
    }
  }

  // 参与人数需要按 (eventId, contactId) 去重，groupBy 不支持 distinct count
  const participants = await db
    .selectDistinct({ eventId: record.eventId, contactId: record.contactId })
    .from(record)
    .where(
      and(
        eq(record.ledgerId, ledgerId),
        inArray(record.eventId, eventIds),
        isNull(record.deletedAt),
      ),
    );

  for (const row of participants) {
    if (!row.eventId) continue;
    const summary = result.get(row.eventId);
    if (summary) summary.participantCount += 1;
  }

  for (const summary of result.values()) {
    summary.netCents = summary.receivedTotalCents - summary.givenTotalCents;
  }

  return result;
}

export async function listEvents(
  ctx: LedgerContext,
  input: { page: number; pageSize: number },
) {
  const where = and(eq(lifeEvent.ledgerId, ctx.ledgerId), isNull(lifeEvent.deletedAt));

  const [totalRows, rows] = await Promise.all([
    db.select({ n: count() }).from(lifeEvent).where(where),
    db
      .select()
      .from(lifeEvent)
      .where(where)
      .orderBy(desc(lifeEvent.occurredAt), desc(lifeEvent.createdAt))
      .offset((input.page - 1) * input.pageSize)
      .limit(input.pageSize),
  ]);

  const summaries = await summaryMap(
    ctx.ledgerId,
    rows.map((row) => row.id),
  );

  return {
    items: rows.map((row) => toDto(row, summaries.get(row.id) ?? emptySummary())),
    total: Number(totalRows[0]?.n ?? 0),
  };
}

export async function getEventDetail(ctx: LedgerContext, eventId: string) {
  const eventRows = await db
    .select()
    .from(lifeEvent)
    .where(
      and(
        eq(lifeEvent.id, eventId),
        eq(lifeEvent.ledgerId, ctx.ledgerId),
        isNull(lifeEvent.deletedAt),
      ),
    )
    .limit(1);
  const event = eventRows[0];
  if (!event) throw new AppError("NOT_FOUND");

  const records = await db.query.record.findMany({
    where: and(
      eq(record.ledgerId, ctx.ledgerId),
      eq(record.eventId, eventId),
      isNull(record.deletedAt),
    ),
    with: recordWith,
    orderBy: [desc(record.occurredAt), desc(record.createdAt)],
  });

  const summary = emptySummary();
  summary.recordCount = records.length;
  const contactIds = new Set<string>();
  for (const r of records) {
    contactIds.add(r.contactId);
    if (r.direction === "GIVEN") {
      summary.givenTotalCents += r.amountCents;
    } else {
      summary.receivedTotalCents += r.amountCents;
      summary.maxReceivedCents = Math.max(summary.maxReceivedCents, r.amountCents);
    }
  }
  summary.participantCount = contactIds.size;
  summary.netCents = summary.receivedTotalCents - summary.givenTotalCents;

  return {
    event: toDto(event, summary),
    records: records.map(recordToDto),
  };
}

export async function createEvent(ctx: LedgerContext, input: CreateEventInput) {
  const inserted = await db
    .insert(lifeEvent)
    .values({
      id: crypto.randomUUID(),
      ledgerId: ctx.ledgerId,
      title: input.title,
      scene: input.scene,
      occurredAt: parseDateOnly(input.occurredAt),
      location: input.location ?? null,
      note: input.note ?? null,
      hosted: input.hosted ?? true,
    })
    .returning();

  return toDto(inserted[0], emptySummary());
}

export async function updateEvent(
  ctx: LedgerContext,
  eventId: string,
  input: UpdateEventInput,
) {
  const existing = await db
    .select({ id: lifeEvent.id })
    .from(lifeEvent)
    .where(
      and(
        eq(lifeEvent.id, eventId),
        eq(lifeEvent.ledgerId, ctx.ledgerId),
        isNull(lifeEvent.deletedAt),
      ),
    )
    .limit(1);
  if (existing.length === 0) throw new AppError("NOT_FOUND");

  const updated = await db
    .update(lifeEvent)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.scene !== undefined ? { scene: input.scene } : {}),
      ...(input.occurredAt !== undefined
        ? { occurredAt: parseDateOnly(input.occurredAt) }
        : {}),
      ...(input.location !== undefined ? { location: input.location } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      ...(input.hosted !== undefined ? { hosted: input.hosted } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(lifeEvent.id, eventId),
        eq(lifeEvent.ledgerId, ctx.ledgerId),
        isNull(lifeEvent.deletedAt),
      ),
    )
    .returning();

  const summary = (await summaryMap(ctx.ledgerId, [eventId])).get(eventId) ?? emptySummary();
  return toDto(updated[0], summary);
}

/** 软删事件：礼金记录本身保留，只是解除关联 */
export async function deleteEvent(ctx: LedgerContext, eventId: string) {
  const existing = await db
    .select({ id: lifeEvent.id })
    .from(lifeEvent)
    .where(
      and(
        eq(lifeEvent.id, eventId),
        eq(lifeEvent.ledgerId, ctx.ledgerId),
        isNull(lifeEvent.deletedAt),
      ),
    )
    .limit(1);
  if (existing.length === 0) throw new AppError("NOT_FOUND");

  const detached = await db.transaction(async (tx) => {
    const removed = await tx
      .update(lifeEvent)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(lifeEvent.id, eventId),
          eq(lifeEvent.ledgerId, ctx.ledgerId),
          isNull(lifeEvent.deletedAt),
        ),
      )
      .returning({ id: lifeEvent.id });
    if (removed.length === 0) throw new AppError("NOT_FOUND");

    return tx
      .update(record)
      .set({ eventId: null, updatedAt: new Date() })
      .where(and(eq(record.ledgerId, ctx.ledgerId), eq(record.eventId, eventId)))
      .returning({ id: record.id });
  });

  return { deleted: true, detachedRecordCount: detached.length };
}
