import { SCENE_LABELS, type GiftScene, type RecordDirection } from "@/lib/constants";
import { daysUntil, parseDateOnly, toDateOnly, todayDateOnly } from "@/lib/date";
import { centsToYuan } from "@/lib/money";

import { prisma } from "@/server/db";
import type { LedgerContext } from "@/server/guards/ledger";
import { AppError } from "@/server/http/errors";
import { recordInclude, recordToDto } from "@/server/mappers/record.mapper";
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

const planInclude = {
  contact: { select: { id: true, name: true, relationTag: true } },
  record: { select: { id: true } },
} as const;

type PlanRow = {
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
};

function toDto(row: PlanRow): PlanDto {
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
  const where = {
    ledgerId: ctx.ledgerId,
    deletedAt: null,
    ...(input.status === "ALL" ? {} : { status: input.status }),
    ...(input.contactId ? { contactId: input.contactId } : {}),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.giftPlan.count({ where }),
    prisma.giftPlan.findMany({
      where,
      include: planInclude,
      orderBy:
        input.status === "DONE"
          ? [{ completedAt: "desc" }, { expectedAt: "desc" }]
          : [{ expectedAt: "asc" }, { createdAt: "asc" }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
  ]);

  return { items: rows.map(toDto), total };
}

/** 首页用：最近要办的几件事 */
export async function getUpcomingPlans(ledgerId: string, limit = 3) {
  const rows = await prisma.giftPlan.findMany({
    where: { ledgerId, deletedAt: null, status: "PLANNED" },
    include: planInclude,
    orderBy: [{ expectedAt: "asc" }, { createdAt: "asc" }],
    take: limit,
  });
  return rows.map(toDto);
}

export async function getPlanSummary(ledgerId: string) {
  const [count, sum] = await Promise.all([
    prisma.giftPlan.count({ where: { ledgerId, deletedAt: null, status: "PLANNED" } }),
    prisma.giftPlan.aggregate({
      where: { ledgerId, deletedAt: null, status: "PLANNED" },
      _sum: { plannedCents: true },
    }),
  ]);
  return { planCount: count, planCents: sum._sum.plannedCents ?? 0 };
}

export async function getPlan(ctx: LedgerContext, planId: string): Promise<PlanDto> {
  const row = await prisma.giftPlan.findFirst({
    where: { id: planId, ledgerId: ctx.ledgerId, deletedAt: null },
    include: planInclude,
  });
  if (!row) throw new AppError("NOT_FOUND");
  return toDto(row);
}

export async function createPlan(ctx: LedgerContext, input: CreatePlanInput): Promise<PlanDto> {
  const contact = await prisma.contact.findFirst({
    where: { id: input.contactId, ledgerId: ctx.ledgerId, deletedAt: null },
    select: { id: true },
  });
  if (!contact) throw new AppError("NOT_FOUND");

  const row = await prisma.giftPlan.create({
    data: {
      ledgerId: ctx.ledgerId,
      contactId: input.contactId,
      direction: input.direction,
      scene: input.scene,
      plannedCents: input.plannedCents,
      expectedAt: parseDateOnly(input.expectedAt),
      note: input.note ?? null,
      createdById: ctx.userId,
    },
    include: planInclude,
  });

  return toDto(row);
}

export async function updatePlan(
  ctx: LedgerContext,
  planId: string,
  input: UpdatePlanInput,
): Promise<PlanDto> {
  const existing = await prisma.giftPlan.findFirst({
    where: { id: planId, ledgerId: ctx.ledgerId, deletedAt: null },
    select: { id: true, status: true },
  });
  if (!existing) throw new AppError("NOT_FOUND");
  if (existing.status === "DONE") {
    throw new AppError("CONFLICT", undefined, "已完成的预备不能再修改");
  }

  const row = await prisma.giftPlan.update({
    where: { id: planId },
    data: {
      ...(input.direction !== undefined ? { direction: input.direction } : {}),
      ...(input.scene !== undefined ? { scene: input.scene } : {}),
      ...(input.plannedCents !== undefined ? { plannedCents: input.plannedCents } : {}),
      ...(input.expectedAt !== undefined
        ? { expectedAt: parseDateOnly(input.expectedAt) }
        : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
    },
    include: planInclude,
  });

  return toDto(row);
}

/** 软删除：预备取消或记错了 */
export async function deletePlan(ctx: LedgerContext, planId: string) {
  const existing = await prisma.giftPlan.findFirst({
    where: { id: planId, ledgerId: ctx.ledgerId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw new AppError("NOT_FOUND");

  await prisma.giftPlan.update({
    where: { id: planId },
    data: { deletedAt: new Date() },
  });

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
  const result = await prisma.$transaction(async (tx) => {
    const plan = await tx.giftPlan.findFirst({
      where: { id: planId, ledgerId: ctx.ledgerId, deletedAt: null },
      include: planInclude,
    });
    if (!plan) throw new AppError("NOT_FOUND");
    if (plan.status === "DONE") throw new AppError("CONFLICT", undefined, "这笔预备已经完成了");

    let record = null;

    if (input.createRecord) {
      record = await tx.record.create({
        data: {
          ledgerId: ctx.ledgerId,
          contactId: plan.contactId,
          direction: plan.direction,
          amountCents: input.amountCents ?? plan.plannedCents,
          scene: plan.scene,
          occurredAt: parseDateOnly(input.occurredAt ?? todayDateOnly()),
          note: plan.note,
          createdById: ctx.userId,
        },
        include: recordInclude,
      });
    }

    const updated = await tx.giftPlan.update({
      where: { id: plan.id },
      data: {
        status: "DONE",
        completedAt: new Date(),
        ...(record ? { recordId: record.id } : {}),
      },
      include: planInclude,
    });

    return { plan: toDto(updated), record: record ? recordToDto(record) : null };
  });

  return result;
}
