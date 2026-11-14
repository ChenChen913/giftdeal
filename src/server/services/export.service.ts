import { SCENE_LABELS, type GiftScene } from "@/lib/constants";
import { toDateOnly } from "@/lib/date";
import { centsToYuan } from "@/lib/money";

import { prisma } from "@/server/db";
import type { LedgerContext } from "@/server/guards/ledger";
import { AppError } from "@/server/http/errors";

/** 单次导出上限：防止一个超大账本把服务端内存打爆 */
const MAX_EXPORT_RECORDS = 20_000;

/**
 * 导出账本全量数据（JSON）。
 *
 * 只导出未软删除的内容，符合用户「删掉的就是不要了」的认知。
 * 调用方必须先确认隐私模式已解锁——这里含真实姓名与金额。
 */
export async function exportLedger(ctx: LedgerContext) {
  const where = { ledgerId: ctx.ledgerId, deletedAt: null };

  const [ledger, memberships, contacts, records, recordCount, plans] = await Promise.all([
    prisma.ledger.findUnique({
      where: { id: ctx.ledgerId },
      select: { id: true, name: true, createdAt: true },
    }),
    prisma.membership.findMany({
      where: { ledgerId: ctx.ledgerId },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { joinedAt: "asc" },
    }),
    prisma.contact.findMany({ where, orderBy: { name: "asc" } }),
    prisma.record.findMany({
      where,
      orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
      take: MAX_EXPORT_RECORDS,
    }),
    prisma.record.count({ where }),
    prisma.giftPlan.findMany({ where, orderBy: { expectedAt: "asc" } }),
  ]);

  if (!ledger) throw new AppError("LEDGER_NOT_FOUND");

  if (recordCount > MAX_EXPORT_RECORDS) {
    throw new AppError(
      "CONFLICT",
      undefined,
      `账本共有 ${recordCount} 笔记录，超过单次导出上限 ${MAX_EXPORT_RECORDS} 笔`,
    );
  }

  const contactName = new Map(contacts.map((contact) => [contact.id, contact.name]));
  const sceneLabel = (scene: string) => SCENE_LABELS[scene as GiftScene] ?? scene;

  return {
    exportedAt: new Date().toISOString(),
    formatVersion: 1,
    ledger: {
      id: ledger.id,
      name: ledger.name,
      createdAt: ledger.createdAt.toISOString(),
    },
    members: memberships.map((membership) => ({
      userId: membership.user.id,
      name: membership.user.name,
      role: membership.role,
      joinedAt: membership.joinedAt.toISOString(),
    })),
    contacts: contacts.map((contact) => ({
      id: contact.id,
      name: contact.name,
      relationTag: contact.relationTag,
      phone: contact.phone,
      note: contact.note,
      createdAt: contact.createdAt.toISOString(),
      updatedAt: contact.updatedAt.toISOString(),
    })),
    records: records.map((record) => ({
      id: record.id,
      contactId: record.contactId,
      contactName: contactName.get(record.contactId) ?? null,
      direction: record.direction,
      directionLabel: record.direction === "GIVEN" ? "送出" : "收到",
      amountCents: record.amountCents,
      amountYuan: centsToYuan(record.amountCents),
      scene: record.scene,
      sceneLabel: sceneLabel(record.scene),
      occurredAt: toDateOnly(record.occurredAt),
      note: record.note,
      settledAt: record.settledAt ? record.settledAt.toISOString() : null,
      settledByRecordId: record.settledByRecordId,
      createdAt: record.createdAt.toISOString(),
    })),
    plans: plans.map((plan) => ({
      id: plan.id,
      contactId: plan.contactId,
      contactName: contactName.get(plan.contactId) ?? null,
      direction: plan.direction,
      scene: plan.scene,
      sceneLabel: sceneLabel(plan.scene),
      plannedCents: plan.plannedCents,
      plannedYuan: centsToYuan(plan.plannedCents),
      expectedAt: toDateOnly(plan.expectedAt),
      status: plan.status,
      note: plan.note,
      recordId: plan.recordId,
      completedAt: plan.completedAt ? plan.completedAt.toISOString() : null,
    })),
  };
}
