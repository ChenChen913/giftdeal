import type { GiftScene, RecordDirection } from "@/lib/constants";
import { parseDateOnly } from "@/lib/date";

import { prisma } from "@/server/db";
import type { LedgerContext } from "@/server/guards/ledger";
import { AppError } from "@/server/http/errors";
import { recordInclude, recordToDto } from "@/server/mappers/record.mapper";
import type { CreateRecordInput, UpdateRecordInput } from "@/server/validators/record";

export type RecordFilters = {
  contactId?: string;
  direction?: RecordDirection;
  scene?: GiftScene;
  settled?: boolean;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
};

export async function listRecords(ctx: LedgerContext, filters: RecordFilters) {
  let direction = filters.direction;

  // settled 隐含「只看收到记录」；显式指定 GIVEN 时结果必然为空
  if (filters.settled !== undefined) {
    if (filters.direction === "GIVEN") {
      return { items: [], total: 0 };
    }
    direction = "RECEIVED";
  }

  const where = {
    ledgerId: ctx.ledgerId,
    deletedAt: null,
    ...(filters.contactId ? { contactId: filters.contactId } : {}),
    ...(direction ? { direction } : {}),
    ...(filters.scene ? { scene: filters.scene } : {}),
    ...(filters.settled !== undefined
      ? { settledAt: filters.settled ? { not: null } : null }
      : {}),
    ...(filters.from || filters.to
      ? {
          occurredAt: {
            ...(filters.from ? { gte: parseDateOnly(filters.from) } : {}),
            ...(filters.to ? { lte: parseDateOnly(filters.to) } : {}),
          },
        }
      : {}),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.record.count({ where }),
    prisma.record.findMany({
      where,
      include: recordInclude,
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
  ]);

  return { items: rows.map(recordToDto), total };
}

export async function getRecord(ctx: LedgerContext, recordId: string) {
  const row = await prisma.record.findFirst({
    where: { id: recordId, ledgerId: ctx.ledgerId, deletedAt: null },
    include: recordInclude,
  });
  if (!row) throw new AppError("NOT_FOUND");
  return recordToDto(row);
}

export async function createRecord(ctx: LedgerContext, input: CreateRecordInput) {
  const contact = await prisma.contact.findFirst({
    where: { id: input.contactId, ledgerId: ctx.ledgerId, deletedAt: null },
    select: { id: true },
  });
  if (!contact) throw new AppError("NOT_FOUND");

  // 事件必须属于本账本，避免把记录挂到别人的事件上
  let eventId: string | null = null;
  if (input.eventId) {
    const event = await prisma.lifeEvent.findFirst({
      where: { id: input.eventId, ledgerId: ctx.ledgerId, deletedAt: null },
      select: { id: true },
    });
    if (!event) throw new AppError("NOT_FOUND", undefined, "关联的事件不存在");
    eventId = event.id;
  }

  const baseData = {
    ledgerId: ctx.ledgerId,
    contactId: input.contactId,
    direction: input.direction,
    amountCents: input.amountCents,
    scene: input.scene,
    occurredAt: parseDateOnly(input.occurredAt),
    note: input.note ?? null,
    createdById: ctx.userId,
    eventId,
  };

  // 场景一：不关联结清（含「创建即已结清」的补录）
  if (!input.settlesRecordId) {
    const row = await prisma.record.create({
      data: {
        ...baseData,
        ...(input.direction === "RECEIVED" && input.settled ? { settledAt: new Date() } : {}),
      },
      include: recordInclude,
    });
    return { record: recordToDto(row), settledRecord: null };
  }

  // 场景二：送出记录关联结清一条收到记录（同一事务）
  return prisma.$transaction(async (tx) => {
    const target = await tx.record.findFirst({
      where: { id: input.settlesRecordId, ledgerId: ctx.ledgerId, deletedAt: null },
      include: recordInclude,
    });

    if (!target) throw new AppError("SETTLE_TARGET_INVALID");
    if (target.direction !== "RECEIVED") throw new AppError("SETTLE_TARGET_INVALID");
    if (target.settledAt) throw new AppError("RECORD_ALREADY_SETTLED");
    if (target.contactId !== input.contactId) throw new AppError("SETTLE_TARGET_INVALID");

    const created = await tx.record.create({ data: baseData, include: recordInclude });

    // 用 updateMany + settledAt 条件抢占，避免并发重复结清
    const claimed = await tx.record.updateMany({
      where: { id: target.id, settledAt: null, deletedAt: null },
      data: { settledAt: new Date(), settledByRecordId: created.id },
    });
    if (claimed.count === 0) throw new AppError("RECORD_ALREADY_SETTLED");

    const settled = await tx.record.findUniqueOrThrow({
      where: { id: target.id },
      include: recordInclude,
    });

    return { record: recordToDto(created), settledRecord: recordToDto(settled) };
  });
}

export async function updateRecord(
  ctx: LedgerContext,
  recordId: string,
  input: UpdateRecordInput,
) {
  const existing = await prisma.record.findFirst({
    where: { id: recordId, ledgerId: ctx.ledgerId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw new AppError("NOT_FOUND");

  if (input.eventId) {
    const event = await prisma.lifeEvent.findFirst({
      where: { id: input.eventId, ledgerId: ctx.ledgerId, deletedAt: null },
      select: { id: true },
    });
    if (!event) throw new AppError("NOT_FOUND", undefined, "关联的事件不存在");
  }

  const row = await prisma.record.update({
    where: { id: recordId },
    data: {
      ...(input.amountCents !== undefined ? { amountCents: input.amountCents } : {}),
      ...(input.scene !== undefined ? { scene: input.scene } : {}),
      ...(input.occurredAt !== undefined
        ? { occurredAt: parseDateOnly(input.occurredAt) }
        : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      ...(input.eventId !== undefined ? { eventId: input.eventId } : {}),
    },
    include: recordInclude,
  });

  return recordToDto(row);
}

/** 软删除记录，并在同一事务里维护结清关系 */
export async function deleteRecord(ctx: LedgerContext, recordId: string) {
  return prisma.$transaction(async (tx) => {
    const record = await tx.record.findFirst({
      where: { id: recordId, ledgerId: ctx.ledgerId, deletedAt: null },
      include: { settledRecord: { select: { id: true } } },
    });
    if (!record) throw new AppError("NOT_FOUND");

    const now = new Date();
    let affectedRecordId: string | null = null;

    if (record.direction === "GIVEN" && record.settledRecord) {
      // 删掉用于结清的送出记录 → 目标收礼回退为未结清
      affectedRecordId = record.settledRecord.id;
      await tx.record.update({
        where: { id: affectedRecordId },
        data: { settledAt: null, settledByRecordId: null },
      });
    }

    if (record.direction === "RECEIVED" && record.settledByRecordId) {
      // 删掉被结清的收礼记录 → 断开送出记录的反向引用
      affectedRecordId = record.settledByRecordId;
    }

    await tx.record.update({
      where: { id: recordId },
      data: {
        deletedAt: now,
        // 收到记录自身携带结清外键，软删时一并清空，避免反向关系指向已删数据
        ...(record.direction === "RECEIVED"
          ? { settledAt: null, settledByRecordId: null }
          : {}),
      },
    });

    return { deleted: true, relatedRecordId: affectedRecordId };
  });
}

export async function settleRecord(ctx: LedgerContext, recordId: string) {
  const record = await prisma.record.findFirst({
    where: { id: recordId, ledgerId: ctx.ledgerId, deletedAt: null },
    select: { id: true, direction: true },
  });
  if (!record) throw new AppError("NOT_FOUND");
  if (record.direction !== "RECEIVED") throw new AppError("RECORD_NOT_SETTLEABLE");

  // 条件更新抢占：并发下只有一个请求能把 settledAt 从 null 改掉，
  // 另一个会拿到 count=0 并得到「已结清」，而不是双双成功。
  const claimed = await prisma.record.updateMany({
    where: { id: recordId, ledgerId: ctx.ledgerId, deletedAt: null, settledAt: null },
    data: { settledAt: new Date(), settledByRecordId: null },
  });
  if (claimed.count === 0) throw new AppError("RECORD_ALREADY_SETTLED");

  const row = await prisma.record.findUniqueOrThrow({
    where: { id: recordId },
    include: recordInclude,
  });
  return recordToDto(row);
}

export async function unsettleRecord(ctx: LedgerContext, recordId: string) {
  const record = await prisma.record.findFirst({
    where: { id: recordId, ledgerId: ctx.ledgerId, deletedAt: null },
    select: { id: true, direction: true, settledAt: true },
  });
  if (!record) throw new AppError("NOT_FOUND");
  if (record.direction !== "RECEIVED") throw new AppError("RECORD_NOT_SETTLEABLE");
  if (!record.settledAt) throw new AppError("RECORD_NOT_SETTLED");

  const row = await prisma.record.update({
    where: { id: recordId },
    data: { settledAt: null, settledByRecordId: null },
    include: recordInclude,
  });
  return recordToDto(row);
}
