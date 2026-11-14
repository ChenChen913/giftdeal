import { and, count, eq, inArray, isNull, max, sql, sum } from "drizzle-orm";

import { GIFT_SCENES, SCENE_LABELS, type GiftScene } from "@/lib/constants";
import { toDateOnly } from "@/lib/date";

import { db } from "@/server/db-drizzle";
import { emptyContactStats, type ContactStats } from "@/server/mappers/contact.mapper";
import { contact, giftPlan, lifeEvent, record } from "@/server/schema";
import { getPlanSummary, getUpcomingPlans } from "./plan.service";

/**
 * 批量计算联系人统计。
 * 净差额永不落库，全部在这里实时聚合。
 *
 * 注意 Drizzle 的 sum() 对 integer 列返回 bigint，PG 驱动给的是 string，
 * 统一用 toCents() 归一，避免把 "12300" 当数字参与运算。
 */
function toCents(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(value);
}

export async function contactStatsMap(
  ledgerId: string,
  contactIds: string[],
): Promise<Map<string, ContactStats>> {
  const result = new Map<string, ContactStats>();
  for (const id of contactIds) result.set(id, emptyContactStats());
  if (contactIds.length === 0) return result;

  const grouped = await db
    .select({
      contactId: record.contactId,
      direction: record.direction,
      total: sum(record.amountCents),
      rowCount: count(),
      lastDate: max(record.occurredAt),
    })
    .from(record)
    .where(
      and(
        eq(record.ledgerId, ledgerId),
        inArray(record.contactId, contactIds),
        isNull(record.deletedAt),
      ),
    )
    .groupBy(record.contactId, record.direction);

  for (const row of grouped) {
    const stats = result.get(row.contactId);
    if (!stats) continue;

    const total = toCents(row.total);
    stats.recordCount += Number(row.rowCount);

    if (row.direction === "GIVEN") stats.givenTotalCents += total;
    else stats.receivedTotalCents += total;

    if (row.lastDate) {
      const day = toDateOnly(row.lastDate);
      if (!stats.lastRecordAt || day > stats.lastRecordAt) stats.lastRecordAt = day;
    }
  }

  const unsettled = await db
    .select({
      contactId: record.contactId,
      total: sum(record.amountCents),
      rowCount: count(),
    })
    .from(record)
    .where(
      and(
        eq(record.ledgerId, ledgerId),
        inArray(record.contactId, contactIds),
        isNull(record.deletedAt),
        eq(record.direction, "RECEIVED"),
        isNull(record.settledAt),
      ),
    )
    .groupBy(record.contactId);

  for (const row of unsettled) {
    const stats = result.get(row.contactId);
    if (!stats) continue;
    stats.unsettledReceivedCount = Number(row.rowCount);
    stats.unsettledReceivedCents = toCents(row.total);
  }

  // 该亲友涉及过哪些礼俗场景，供前端「按礼金性质」筛选
  const scenes = await db
    .selectDistinct({ contactId: record.contactId, scene: record.scene })
    .from(record)
    .where(
      and(
        eq(record.ledgerId, ledgerId),
        inArray(record.contactId, contactIds),
        isNull(record.deletedAt),
      ),
    );

  const sceneOrder = GIFT_SCENES as readonly string[];
  for (const row of scenes) {
    const stats = result.get(row.contactId);
    if (!stats) continue;
    stats.scenes.push(row.scene as GiftScene);
  }
  for (const stats of result.values()) {
    stats.scenes.sort((a, b) => sceneOrder.indexOf(a) - sceneOrder.indexOf(b));
  }

  // 每位亲友「预备中」的笔数，供往来册按「有无预备安排」分类
  const plans = await db
    .select({ contactId: giftPlan.contactId, rowCount: count() })
    .from(giftPlan)
    .where(
      and(
        eq(giftPlan.ledgerId, ledgerId),
        inArray(giftPlan.contactId, contactIds),
        isNull(giftPlan.deletedAt),
        eq(giftPlan.status, "PLANNED"),
      ),
    )
    .groupBy(giftPlan.contactId);

  for (const row of plans) {
    const stats = result.get(row.contactId);
    if (stats) stats.planCount = Number(row.rowCount);
  }

  for (const stats of result.values()) {
    stats.netCents = stats.receivedTotalCents - stats.givenTotalCents;
  }

  return result;
}

export async function getOverview(ledgerId: string) {
  const base = and(eq(record.ledgerId, ledgerId), isNull(record.deletedAt));

  const [
    contactCountRows,
    recordCountRows,
    given,
    received,
    pending,
    scenes,
    planSummary,
    upcoming,
    eventCountRows,
  ] = await Promise.all([
    db
      .select({ n: count() })
      .from(contact)
      .where(and(eq(contact.ledgerId, ledgerId), isNull(contact.deletedAt))),
    db.select({ n: count() }).from(record).where(base),
    db
      .select({ total: sum(record.amountCents), n: count() })
      .from(record)
      .where(and(base, eq(record.direction, "GIVEN"))),
    db
      .select({ total: sum(record.amountCents), n: count() })
      .from(record)
      .where(and(base, eq(record.direction, "RECEIVED"))),
    db
      .select({ total: sum(record.amountCents), n: count() })
      .from(record)
      .where(and(base, eq(record.direction, "RECEIVED"), isNull(record.settledAt))),
    db
      .select({ scene: record.scene, total: sum(record.amountCents), n: count() })
      .from(record)
      .where(base)
      .groupBy(record.scene),
    getPlanSummary(ledgerId),
    getUpcomingPlans(ledgerId, 1),
    db
      .select({ n: count() })
      .from(lifeEvent)
      .where(and(eq(lifeEvent.ledgerId, ledgerId), isNull(lifeEvent.deletedAt))),
  ]);

  const givenTotalCents = toCents(given[0]?.total);
  const receivedTotalCents = toCents(received[0]?.total);

  const sceneBreakdown = scenes
    .map((row) => ({
      scene: row.scene,
      sceneLabel: SCENE_LABELS[row.scene as GiftScene] ?? row.scene,
      count: Number(row.n),
      totalCents: toCents(row.total),
    }))
    .sort((a, b) => b.totalCents - a.totalCents);

  return {
    ledgerId,
    contactCount: Number(contactCountRows[0]?.n ?? 0),
    recordCount: Number(recordCountRows[0]?.n ?? 0),
    givenCount: Number(given[0]?.n ?? 0),
    receivedCount: Number(received[0]?.n ?? 0),
    givenTotalCents,
    receivedTotalCents,
    netCents: receivedTotalCents - givenTotalCents,
    pendingReturnCount: Number(pending[0]?.n ?? 0),
    pendingReturnCents: toCents(pending[0]?.total),
    planCount: planSummary.planCount,
    planCents: planSummary.planCents,
    nextPlan: upcoming[0] ?? null,
    eventCount: Number(eventCountRows[0]?.n ?? 0),
    sceneBreakdown,
  };
}
