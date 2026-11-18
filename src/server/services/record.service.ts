import { and, count, eq, gte, isNull, isNotNull, lte, sql } from "drizzle-orm";

import type { GiftScene, RecordDirection } from "@/lib/constants";
import { parseDateOnly } from "@/lib/date";

import { db } from "@/server/db-drizzle";
import type { LedgerContext } from "@/server/guards/ledger";
import { AppError } from "@/server/http/errors";
import { recordToDto } from "@/server/mappers/record.mapper";
import { contact, lifeEvent, record } from "@/server/schema";
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

/** 与 Prisma 的 recordInclude 等价：contact 三字段 + 被结清记录 id */
const recordWith = {
  contact: { columns: { id: true, name: true, relationTag: true } },
  settledRecord: { columns: { id: true } },
} as const;

/** Prisma 的 @default(cuid()) 是客户端生成，数据库无默认值 */
function newId(): string {
  return crypto.randomUUID();
}

export async function listRecords(ctx: LedgerContext, filters: RecordFilters) {
  let direction = filters.direction;

  // settled 隐含「只看收到记录」；显式指定 GIVEN 时结果必然为空
  if (filters.settled !== undefined) {
    if (filters.direction === "GIVEN") {
      return { items: [], total: 0 };
    }
    direction = "RECEIVED";
  }

  const conditions = [eq(record.ledgerId, ctx.ledgerId), isNull(record.deletedAt)];
  if (filters.contactId) conditions.push(eq(record.contactId, filters.contactId));
  if (direction) conditions.push(eq(record.direction, direction));
  if (filters.scene) conditions.push(eq(record.scene, filters.scene));
  if (filters.settled !== undefined) {
    conditions.push(filters.settled ? isNotNull(record.settledAt) : isNull(record.settledAt));
  }
  if (filters.from) conditions.push(gte(record.occurredAt, parseDateOnly(filters.from)));
  if (filters.to) conditions.push(lte(record.occurredAt, parseDateOnly(filters.to)));

  const where = and(...conditions);

  const [totalRows, rows] = await Promise.all([
    db.select({ n: count() }).from(record).where(where),
    db.query.record.findMany({
      where,
      with: recordWith,
      orderBy: [sql`${record.occurredAt} DESC`, sql`${record.createdAt} DESC`],
      offset: (filters.page - 1) * filters.pageSize,
      limit: filters.pageSize,
    }),
  ]);

  return { items: rows.map(recordToDto), total: Number(totalRows[0]?.n ?? 0) };
}

export async function getRecord(ctx: LedgerContext, recordId: string) {
  const row = await db.query.record.findFirst({
    where: and(
      eq(record.id, recordId),
      eq(record.ledgerId, ctx.ledgerId),
      isNull(record.deletedAt),
    ),
    with: recordWith,
  });
  if (!row) throw new AppError("NOT_FOUND");
  return recordToDto(row);
}

export async function createRecord(ctx: LedgerContext, input: CreateRecordInput) {
  const contactRows = await db
    .select({ id: contact.id })
    .from(contact)
    .where(
      and(
        eq(contact.id, input.contactId),
        eq(contact.ledgerId, ctx.ledgerId),
        isNull(contact.deletedAt),
      ),
    )
    .limit(1);
  if (contactRows.length === 0) throw new AppError("NOT_FOUND");

  // 事件必须属于本账本，避免把记录挂到别人的事件上
  let eventId: string | null = null;
  if (input.eventId) {
    const eventRows = await db
      .select({ id: lifeEvent.id })
      .from(lifeEvent)
      .where(
        and(
          eq(lifeEvent.id, input.eventId),
          eq(lifeEvent.ledgerId, ctx.ledgerId),
          isNull(lifeEvent.deletedAt),
        ),
      )
      .limit(1);
    if (eventRows.length === 0) throw new AppError("NOT_FOUND", undefined, "关联的事件不存在");
    eventId = eventRows[0].id;
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
    const inserted = await db
      .insert(record)
      .values({
        id: newId(),
        ...baseData,
        ...(input.direction === "RECEIVED" && input.settled ? { settledAt: new Date() } : {}),
      })
      .returning({ id: record.id });

    const row = await db.query.record.findFirst({
      where: eq(record.id, inserted[0].id),
      with: recordWith,
    });
    if (!row) throw new AppError("INTERNAL_ERROR", undefined, "记录写入后读取失败");
    return { record: recordToDto(row), settledRecord: null };
  }

  // 场景二：送出记录关联结清一条收到记录（同一事务）
  return db.transaction(async (tx) => {
    const target = await tx.query.record.findFirst({
      where: and(
        eq(record.id, input.settlesRecordId!),
        eq(record.ledgerId, ctx.ledgerId),
        isNull(record.deletedAt),
      ),
      with: recordWith,
    });

    if (!target) throw new AppError("SETTLE_TARGET_INVALID");
    if (target.direction !== "RECEIVED") throw new AppError("SETTLE_TARGET_INVALID");
    if (target.settledAt) throw new AppError("RECORD_ALREADY_SETTLED");
    if (target.contactId !== input.contactId) throw new AppError("SETTLE_TARGET_INVALID");

    const createdId = newId();
    await tx.insert(record).values({ id: createdId, ...baseData });

    // 用 settledAt 条件抢占，避免并发重复结清
    const claimed = await tx
      .update(record)
      .set({ settledAt: new Date(), settledByRecordId: createdId, updatedAt: new Date() })
      .where(and(eq(record.id, target.id), isNull(record.settledAt), isNull(record.deletedAt)))
      .returning({ id: record.id });
    if (claimed.length === 0) throw new AppError("RECORD_ALREADY_SETTLED");

    const created = await tx.query.record.findFirst({
      where: eq(record.id, createdId),
      with: recordWith,
    });
    const settled = await tx.query.record.findFirst({
      where: eq(record.id, target.id),
      with: recordWith,
    });

    return { record: recordToDto(created!), settledRecord: recordToDto(settled!) };
  });
}

export async function updateRecord(
  ctx: LedgerContext,
  recordId: string,
  input: UpdateRecordInput,
) {
  const existing = await db
    .select({ id: record.id })
    .from(record)
    .where(and(eq(record.id, recordId), eq(record.ledgerId, ctx.ledgerId), isNull(record.deletedAt)))
    .limit(1);
  if (existing.length === 0) throw new AppError("NOT_FOUND");

  if (input.eventId) {
    const eventRows = await db
      .select({ id: lifeEvent.id })
      .from(lifeEvent)
      .where(
        and(
          eq(lifeEvent.id, input.eventId),
          eq(lifeEvent.ledgerId, ctx.ledgerId),
          isNull(lifeEvent.deletedAt),
        ),
      )
      .limit(1);
    if (eventRows.length === 0) throw new AppError("NOT_FOUND", undefined, "关联的事件不存在");
  }

  await db
    .update(record)
    .set({
      ...(input.amountCents !== undefined ? { amountCents: input.amountCents } : {}),
      ...(input.scene !== undefined ? { scene: input.scene } : {}),
      ...(input.occurredAt !== undefined
        ? { occurredAt: parseDateOnly(input.occurredAt) }
        : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      ...(input.eventId !== undefined ? { eventId: input.eventId } : {}),
      updatedAt: new Date(),
    })
    // 带上 ledgerId / deletedAt：即使并发删除了记录，也不会被这次更新「复活」
    .where(
      and(
        eq(record.id, recordId),
        eq(record.ledgerId, ctx.ledgerId),
        isNull(record.deletedAt),
      ),
    );

  const row = await db.query.record.findFirst({
    where: eq(record.id, recordId),
    with: recordWith,
  });
  if (!row) throw new AppError("NOT_FOUND");
  return recordToDto(row);
}

/** 软删除记录，并在同一事务里维护结清关系 */
export async function deleteRecord(ctx: LedgerContext, recordId: string) {
  return db.transaction(async (tx) => {
    const target = await tx.query.record.findFirst({
      where: and(
        eq(record.id, recordId),
        eq(record.ledgerId, ctx.ledgerId),
        isNull(record.deletedAt),
      ),
    });
    if (!target) throw new AppError("NOT_FOUND");

    const now = new Date();
    let affectedRecordId: string | null = null;

    if (target.direction === "GIVEN") {
      /**
       * 外键存在「收到」记录上：received.settledByRecordId = given.id。
       * 所以要按 settledByRecordId 反查，不能只看当前行的 settledRecord
       * （送出行自己的 settledByRecordId 恒为 null，之前那版判断是死代码，
       * 删掉用于结清的送出行不会让收礼回退成待回礼）。
       */
      const settledRows = await tx
        .select({ id: record.id })
        .from(record)
        .where(and(eq(record.settledByRecordId, target.id), isNull(record.deletedAt)))
        .limit(1);

      if (settledRows[0]) {
        affectedRecordId = settledRows[0].id;
        await tx
          .update(record)
          .set({ settledAt: null, settledByRecordId: null, updatedAt: now })
          .where(eq(record.id, affectedRecordId));
      }
    } else if (target.settledByRecordId) {
      // 删掉被结清的收礼记录 → 告诉调用方是哪条送出行解除了结清
      affectedRecordId = target.settledByRecordId;
    }

    await tx
      .update(record)
      .set({
        deletedAt: now,
        updatedAt: now,
        // 收到记录自身携带结清外键，软删时一并清空，避免反向关系指向已删数据
        ...(target.direction === "RECEIVED"
          ? { settledAt: null, settledByRecordId: null }
          : {}),
      })
      .where(
        and(
          eq(record.id, recordId),
          eq(record.ledgerId, ctx.ledgerId),
          isNull(record.deletedAt),
        ),
      );

    return { deleted: true, relatedRecordId: affectedRecordId };
  });
}

export async function settleRecord(ctx: LedgerContext, recordId: string) {
  const rows = await db
    .select({ id: record.id, direction: record.direction })
    .from(record)
    .where(and(eq(record.id, recordId), eq(record.ledgerId, ctx.ledgerId), isNull(record.deletedAt)))
    .limit(1);
  const target = rows[0];
  if (!target) throw new AppError("NOT_FOUND");
  if (target.direction !== "RECEIVED") throw new AppError("RECORD_NOT_SETTLEABLE");

  // 条件更新抢占：并发下只有一个请求能把 settledAt 从 null 改掉
  const claimed = await db
    .update(record)
    .set({ settledAt: new Date(), settledByRecordId: null, updatedAt: new Date() })
    .where(
      and(
        eq(record.id, recordId),
        eq(record.ledgerId, ctx.ledgerId),
        isNull(record.deletedAt),
        isNull(record.settledAt),
      ),
    )
    .returning({ id: record.id });
  if (claimed.length === 0) throw new AppError("RECORD_ALREADY_SETTLED");

  const row = await db.query.record.findFirst({
    where: eq(record.id, recordId),
    with: recordWith,
  });
  if (!row) throw new AppError("NOT_FOUND");
  return recordToDto(row);
}

export async function unsettleRecord(ctx: LedgerContext, recordId: string) {
  const rows = await db
    .select({ id: record.id, direction: record.direction, settledAt: record.settledAt })
    .from(record)
    .where(and(eq(record.id, recordId), eq(record.ledgerId, ctx.ledgerId), isNull(record.deletedAt)))
    .limit(1);
  const target = rows[0];
  if (!target) throw new AppError("NOT_FOUND");
  if (target.direction !== "RECEIVED") throw new AppError("RECORD_NOT_SETTLEABLE");
  if (!target.settledAt) throw new AppError("RECORD_NOT_SETTLED");

  const cleared = await db
    .update(record)
    .set({ settledAt: null, settledByRecordId: null, updatedAt: new Date() })
    .where(
      and(
        eq(record.id, recordId),
        eq(record.ledgerId, ctx.ledgerId),
        isNull(record.deletedAt),
        isNotNull(record.settledAt),
      ),
    )
    .returning({ id: record.id });
  if (cleared.length === 0) throw new AppError("RECORD_NOT_SETTLED");

  const row = await db.query.record.findFirst({
    where: eq(record.id, recordId),
    with: recordWith,
  });
  if (!row) throw new AppError("NOT_FOUND");
  return recordToDto(row);
}
