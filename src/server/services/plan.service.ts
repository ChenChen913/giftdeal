import { and, asc, count, desc, eq, isNull, sum } from "drizzle-orm";

import { SCENE_LABELS, type GiftScene, type RecordDirection } from "@/lib/constants";
import { daysUntil, parseDateOnly, toDateOnly, todayDateOnly } from "@/lib/date";
import { centsToYuan } from "@/lib/money";

import { db } from "@/server/db-drizzle";
import type { LedgerContext } from "@/server/guards/ledger";
import { AppError } from "@/server/http/errors";
import { recordToDto } from "@/server/mappers/record.mapper";
import { contact, giftPlan, record } from "@/server/schema";
import type {
  CompletePlanInput,
  CreatePlanInput,
  UpdatePlanInput,
} from "@/server/validators/plan";

export type PlanDto = {
  id: string;
  ledgerId: string;
  contactId: string;
  contact: { id: string; name: string; relationTag: string | null };
  direction: RecordDirection;
  scene: GiftScene;
  sceneLabel: string;
  plannedCents: number;
  plannedYuan: string;
  expectedAt: string;
  /** 距预计日期还有几天：正数=未来，0=今天，负数=已过 */
  daysUntil: number;
  status: "PLANNED" | "DONE";
  note: string | null;
  recordId: string | null;
  completedAt: string | null;
  createdAt: string;
};

const planWith = {
  contact: { columns: { id: true, name: true, relationTag: true } },
  record: { columns: { id: true } },
} as const;

const recordWith = {
  contact: { columns: { id: true, name: true, relationTag: true } },
  settledRecord: { columns: { id: true } },
} as const;

function toCents(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(value);
}

function newId(): string {
  return crypto.randomUUID();
}

function toDto(row: {
  id: string;
  ledgerId: string;
  contactId: string;
  direction: string;
  scene: string;
  plannedCents: number;
  expectedAt: Date;
  status: string;
  note: string | null;
  recordId: string | null;
  completedAt: Date | null;
  createdAt: Date;
  contact: { id: string; name: string; relationTag: string | null };
  record?: { id: string } | null;
}): PlanDto {
  return {
    id: row.id,
    ledgerId: row.ledgerId,
    contactId: row.contactId,
    contact: row.contact,
    direction: row.direction as RecordDirection,
    scene: row.scene as GiftScene,
    sceneLabel: SCENE_LABELS[row.scene as GiftScene] ?? row.scene,
    plannedCents: row.plannedCents,
    plannedYuan: centsToYuan(row.plannedCents),
    expectedAt: toDateOnly(row.expectedAt),
    daysUntil: daysUntil(row.expectedAt),
    status: row.status as "PLANNED" | "DONE",
    note: row.note,
    recordId: row.recordId ?? row.record?.id ?? null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listPlans(
  ctx: LedgerContext,
  input: { status: "PLANNED" | "DONE" | "ALL"; contactId?: string; page: number; pageSize: number },
) {
  const conditions = [eq(giftPlan.ledgerId, ctx.ledgerId), isNull(giftPlan.deletedAt)];
  if (input.status !== "ALL") conditions.push(eq(giftPlan.status, input.status));
  if (input.contactId) conditions.push(eq(giftPlan.contactId, input.contactId));
  const where = and(...conditions);

  const orderBy =
    input.status === "DONE"
      ? [desc(giftPlan.completedAt), desc(giftPlan.expectedAt)]
      : [asc(giftPlan.expectedAt), asc(giftPlan.createdAt)];

  const [totalRows, rows] = await Promise.all([
    db.select({ n: count() }).from(giftPlan).where(where),
    db.query.giftPlan.findMany({
      where,
      with: planWith,
      orderBy,
      offset: (input.page - 1) * input.pageSize,
      limit: input.pageSize,
    }),
  ]);

  return { items: rows.map(toDto), total: Number(totalRows[0]?.n ?? 0) };
}

/** 首页用：最近要办的几件事 */
export async function getUpcomingPlans(ledgerId: string, limit = 3) {
  const rows = await db.query.giftPlan.findMany({
    where: and(
      eq(giftPlan.ledgerId, ledgerId),
      isNull(giftPlan.deletedAt),
      eq(giftPlan.status, "PLANNED"),
    ),
    with: planWith,
    orderBy: [asc(giftPlan.expectedAt), asc(giftPlan.createdAt)],
    limit,
  });
  return rows.map(toDto);
}

export async function getPlanSummary(ledgerId: string) {
  const where = and(
    eq(giftPlan.ledgerId, ledgerId),
    isNull(giftPlan.deletedAt),
    eq(giftPlan.status, "PLANNED"),
  );

  const [countRows, sumRows] = await Promise.all([
    db.select({ n: count() }).from(giftPlan).where(where),
    db.select({ total: sum(giftPlan.plannedCents) }).from(giftPlan).where(where),
  ]);

  return {
    planCount: Number(countRows[0]?.n ?? 0),
    planCents: toCents(sumRows[0]?.total),
  };
}

export async function getPlan(ctx: LedgerContext, planId: string): Promise<PlanDto> {
  const row = await db.query.giftPlan.findFirst({
    where: and(
      eq(giftPlan.id, planId),
      eq(giftPlan.ledgerId, ctx.ledgerId),
      isNull(giftPlan.deletedAt),
    ),
    with: planWith,
  });
  if (!row) throw new AppError("NOT_FOUND");
  return toDto(row);
}

export async function createPlan(ctx: LedgerContext, input: CreatePlanInput): Promise<PlanDto> {
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

  const inserted = await db
    .insert(giftPlan)
    .values({
      id: newId(),
      ledgerId: ctx.ledgerId,
      contactId: input.contactId,
      direction: input.direction,
      scene: input.scene,
      plannedCents: input.plannedCents,
      expectedAt: parseDateOnly(input.expectedAt),
      note: input.note ?? null,
      createdById: ctx.userId,
    })
    .returning({ id: giftPlan.id });

  const row = await db.query.giftPlan.findFirst({
    where: eq(giftPlan.id, inserted[0].id),
    with: planWith,
  });
  return toDto(row!);
}

export async function updatePlan(
  ctx: LedgerContext,
  planId: string,
  input: UpdatePlanInput,
): Promise<PlanDto> {
  const existing = await db
    .select({ id: giftPlan.id, status: giftPlan.status })
    .from(giftPlan)
    .where(
      and(eq(giftPlan.id, planId), eq(giftPlan.ledgerId, ctx.ledgerId), isNull(giftPlan.deletedAt)),
    )
    .limit(1);
  if (existing.length === 0) throw new AppError("NOT_FOUND");
  if (existing[0].status === "DONE") {
    throw new AppError("CONFLICT", undefined, "已完成的预备不能再修改");
  }

  await db
    .update(giftPlan)
    .set({
      ...(input.direction !== undefined ? { direction: input.direction } : {}),
      ...(input.scene !== undefined ? { scene: input.scene } : {}),
      ...(input.plannedCents !== undefined ? { plannedCents: input.plannedCents } : {}),
      ...(input.expectedAt !== undefined
        ? { expectedAt: parseDateOnly(input.expectedAt) }
        : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      updatedAt: new Date(),
    })
    .where(eq(giftPlan.id, planId));

  const row = await db.query.giftPlan.findFirst({
    where: eq(giftPlan.id, planId),
    with: planWith,
  });
  return toDto(row!);
}

/** 软删除：预备取消或记错了 */
export async function deletePlan(ctx: LedgerContext, planId: string) {
  const existing = await db
    .select({ id: giftPlan.id })
    .from(giftPlan)
    .where(
      and(eq(giftPlan.id, planId), eq(giftPlan.ledgerId, ctx.ledgerId), isNull(giftPlan.deletedAt)),
    )
    .limit(1);
  if (existing.length === 0) throw new AppError("NOT_FOUND");

  await db
    .update(giftPlan)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(giftPlan.id, planId));

  return { deleted: true };
}

/**
 * 完成一笔预备。
 * 默认同时生成一条真实礼金记录并关联；也可以只标记完成（例如礼金早先已单独记过）。
 */
export async function completePlan(
  ctx: LedgerContext,
  planId: string,
  input: CompletePlanInput,
) {
  return db.transaction(async (tx) => {
    const plan = await tx.query.giftPlan.findFirst({
      where: and(
        eq(giftPlan.id, planId),
        eq(giftPlan.ledgerId, ctx.ledgerId),
        isNull(giftPlan.deletedAt),
      ),
      with: planWith,
    });
    if (!plan) throw new AppError("NOT_FOUND");
    if (plan.status === "DONE") throw new AppError("CONFLICT", undefined, "这笔预备已经完成了");

    let createdRecordId: string | null = null;

    if (input.createRecord) {
      createdRecordId = newId();
      await tx.insert(record).values({
        id: createdRecordId,
        ledgerId: ctx.ledgerId,
        contactId: plan.contactId,
        direction: plan.direction,
        amountCents: input.amountCents ?? plan.plannedCents,
        scene: plan.scene,
        occurredAt: parseDateOnly(input.occurredAt ?? todayDateOnly()),
        note: plan.note,
        createdById: ctx.userId,
      });
    }

    await tx
      .update(giftPlan)
      .set({
        status: "DONE",
        completedAt: new Date(),
        updatedAt: new Date(),
        ...(createdRecordId ? { recordId: createdRecordId } : {}),
      })
      .where(eq(giftPlan.id, plan.id));

    const updated = await tx.query.giftPlan.findFirst({
      where: eq(giftPlan.id, plan.id),
      with: planWith,
    });

    const created = createdRecordId
      ? await tx.query.record.findFirst({
          where: eq(record.id, createdRecordId),
          with: recordWith,
        })
      : null;

    return { plan: toDto(updated!), record: created ? recordToDto(created) : null };
  });
}
