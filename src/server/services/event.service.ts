import { SCENE_LABELS, type GiftScene } from "@/lib/constants";
import { parseDateOnly, toDateOnly } from "@/lib/date";

import { prisma } from "@/server/db";
import type { LedgerContext } from "@/server/guards/ledger";
import { AppError } from "@/server/http/errors";
import { recordInclude, recordToDto } from "@/server/mappers/record.mapper";
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

type EventRow = {
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
};

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

function toDto(row: EventRow, summary: EventSummary): EventDto {
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

  const grouped = await prisma.record.groupBy({
    by: ["eventId", "direction"],
    where: { ledgerId, eventId: { in: eventIds }, deletedAt: null },
    _sum: { amountCents: true },
    _count: { _all: true },
    _max: { amountCents: true },
  });

  for (const row of grouped) {
    if (!row.eventId) continue;
    const summary = result.get(row.eventId);
    if (!summary) continue;

    const sum = row._sum.amountCents ?? 0;
    summary.recordCount += row._count._all;

    if (row.direction === "GIVEN") {
      summary.givenTotalCents += sum;
    } else {
      summary.receivedTotalCents += sum;
      summary.maxReceivedCents = Math.max(summary.maxReceivedCents, row._max.amountCents ?? 0);
    }
  }

  // 参与人数需要按 (eventId, contactId) 去重，groupBy 不支持 distinct count
  const participants = await prisma.record.findMany({
    where: { ledgerId, eventId: { in: eventIds }, deletedAt: null },
    select: { eventId: true, contactId: true },
    distinct: ["eventId", "contactId"],
  });

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
  const where = { ledgerId: ctx.ledgerId, deletedAt: null };

  const [total, rows] = await prisma.$transaction([
    prisma.lifeEvent.count({ where }),
    prisma.lifeEvent.findMany({
      where,
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
  ]);

  const summaries = await summaryMap(
    ctx.ledgerId,
    rows.map((row) => row.id),
  );

  return {
    items: rows.map((row) => toDto(row, summaries.get(row.id) ?? emptySummary())),
    total,
  };
}

export async function getEventDetail(ctx: LedgerContext, eventId: string) {
  const event = await prisma.lifeEvent.findFirst({
    where: { id: eventId, ledgerId: ctx.ledgerId, deletedAt: null },
  });
  if (!event) throw new AppError("NOT_FOUND");

  const records = await prisma.record.findMany({
    where: { ledgerId: ctx.ledgerId, eventId, deletedAt: null },
    include: recordInclude,
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
  });

  const summary = emptySummary();
  summary.recordCount = records.length;
  const contacts = new Set<string>();
  for (const record of records) {
    contacts.add(record.contactId);
    if (record.direction === "GIVEN") {
      summary.givenTotalCents += record.amountCents;
    } else {
      summary.receivedTotalCents += record.amountCents;
      summary.maxReceivedCents = Math.max(summary.maxReceivedCents, record.amountCents);
    }
  }
  summary.participantCount = contacts.size;
  summary.netCents = summary.receivedTotalCents - summary.givenTotalCents;

  return {
    event: toDto(event, summary),
    records: records.map(recordToDto),
  };
}

export async function createEvent(ctx: LedgerContext, input: CreateEventInput) {
  const row = await prisma.lifeEvent.create({
    data: {
      ledgerId: ctx.ledgerId,
      title: input.title,
      scene: input.scene,
      occurredAt: parseDateOnly(input.occurredAt),
      location: input.location ?? null,
      note: input.note ?? null,
      hosted: input.hosted ?? true,
    },
  });

  return toDto(row, emptySummary());
}

export async function updateEvent(
  ctx: LedgerContext,
  eventId: string,
  input: UpdateEventInput,
) {
  const existing = await prisma.lifeEvent.findFirst({
    where: { id: eventId, ledgerId: ctx.ledgerId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw new AppError("NOT_FOUND");

  const row = await prisma.lifeEvent.update({
    where: { id: eventId },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.scene !== undefined ? { scene: input.scene } : {}),
      ...(input.occurredAt !== undefined
        ? { occurredAt: parseDateOnly(input.occurredAt) }
        : {}),
      ...(input.location !== undefined ? { location: input.location } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      ...(input.hosted !== undefined ? { hosted: input.hosted } : {}),
    },
  });

  const summary = (await summaryMap(ctx.ledgerId, [eventId])).get(eventId) ?? emptySummary();
  return toDto(row, summary);
}

/** 软删事件：礼金记录本身保留，只是解除关联 */
export async function deleteEvent(ctx: LedgerContext, eventId: string) {
  const existing = await prisma.lifeEvent.findFirst({
    where: { id: eventId, ledgerId: ctx.ledgerId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw new AppError("NOT_FOUND");

  const [, detached] = await prisma.$transaction([
    prisma.lifeEvent.update({
      where: { id: eventId },
      data: { deletedAt: new Date() },
    }),
    prisma.record.updateMany({
      where: { ledgerId: ctx.ledgerId, eventId },
      data: { eventId: null },
    }),
  ]);

  return { deleted: true, detachedRecordCount: detached.count };
}
