import { and, asc, count, eq, isNull, sql } from "drizzle-orm";

import { SCENE_LABELS, type GiftScene } from "@/lib/constants";
import { toDateOnly } from "@/lib/date";
import { centsToYuan } from "@/lib/money";

import { db } from "@/server/db-drizzle";
import type { LedgerContext } from "@/server/guards/ledger";
import { AppError } from "@/server/http/errors";
import { contact, giftPlan, ledger as ledgerTable, membership, record } from "@/server/schema";

/** 单次导出上限：防止一个超大账本把服务端内存打爆 */
const MAX_EXPORT_RECORDS = 20_000;

/**
 * 导出账本全量数据（JSON）。
 *
 * 只导出未软删除的内容，符合用户「删掉的就是不要了」的认知。
 * 调用方必须先确认隐私模式已解锁——这里含真实姓名与金额。
 */
export async function exportLedger(ctx: LedgerContext) {
  const where = and(eq(record.ledgerId, ctx.ledgerId), isNull(record.deletedAt));
  const contactWhere = and(eq(contact.ledgerId, ctx.ledgerId), isNull(contact.deletedAt));
  const planWhere = and(eq(giftPlan.ledgerId, ctx.ledgerId), isNull(giftPlan.deletedAt));

  const [ledgerRows, memberships, contacts, records, recordCountRows, plans] = await Promise.all([
    db
      .select({ id: ledgerTable.id, name: ledgerTable.name, createdAt: ledgerTable.createdAt })
      .from(ledgerTable)
      .where(eq(ledgerTable.id, ctx.ledgerId))
      .limit(1),
    db.query.membership.findMany({
      where: eq(membership.ledgerId, ctx.ledgerId),
      with: { user: { columns: { id: true, name: true } } },
      orderBy: [asc(membership.joinedAt)],
    }),
    db.query.contact.findMany({
      where: contactWhere,
      orderBy: [asc(contact.name)],
    }),
    db.query.record.findMany({
      where,
      orderBy: [asc(record.occurredAt), asc(record.createdAt)],
      limit: MAX_EXPORT_RECORDS,
    }),
    db.select({ n: count() }).from(record).where(where),
    db.query.giftPlan.findMany({
      where: planWhere,
      orderBy: [asc(giftPlan.expectedAt)],
    }),
  ]);

  const ledger = ledgerRows[0];
  if (!ledger) throw new AppError("LEDGER_NOT_FOUND");

  const recordCount = Number(recordCountRows[0]?.n ?? 0);
  if (recordCount > MAX_EXPORT_RECORDS) {
    throw new AppError(
      "CONFLICT",
      undefined,
      `账本共有 ${recordCount} 笔记录，超过单次导出上限 ${MAX_EXPORT_RECORDS} 笔`,
    );
  }

  const contactName = new Map(contacts.map((c) => [c.id, c.name]));
  const sceneLabel = (scene: string) => SCENE_LABELS[scene as GiftScene] ?? scene;

  return {
    exportedAt: new Date().toISOString(),
    formatVersion: 1,
    ledger: {
      id: ledger.id,
      name: ledger.name,
      createdAt: ledger.createdAt.toISOString(),
    },
    members: memberships.map((m) => ({
      userId: m.user.id,
      name: m.user.name,
      role: m.role,
      joinedAt: m.joinedAt.toISOString(),
    })),
    contacts: contacts.map((c) => ({
      id: c.id,
      name: c.name,
      relationTag: c.relationTag,
      phone: c.phone,
      note: c.note,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
    records: records.map((r) => ({
      id: r.id,
      contactId: r.contactId,
      contactName: contactName.get(r.contactId) ?? null,
      direction: r.direction,
      directionLabel: r.direction === "GIVEN" ? "送出" : "收到",
      amountCents: r.amountCents,
      amountYuan: centsToYuan(r.amountCents),
      scene: r.scene,
      sceneLabel: sceneLabel(r.scene),
      occurredAt: toDateOnly(r.occurredAt),
      note: r.note,
      settledAt: r.settledAt ? r.settledAt.toISOString() : null,
      settledByRecordId: r.settledByRecordId,
      createdAt: r.createdAt.toISOString(),
    })),
    plans: plans.map((p) => ({
      id: p.id,
      contactId: p.contactId,
      contactName: contactName.get(p.contactId) ?? null,
      direction: p.direction,
      scene: p.scene,
      sceneLabel: sceneLabel(p.scene),
      plannedCents: p.plannedCents,
      plannedYuan: centsToYuan(p.plannedCents),
      expectedAt: toDateOnly(p.expectedAt),
      status: p.status,
      note: p.note,
      recordId: p.recordId,
      completedAt: p.completedAt ? p.completedAt.toISOString() : null,
    })),
  };
}
