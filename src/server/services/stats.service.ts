import { GIFT_SCENES, SCENE_LABELS, type GiftScene } from "@/lib/constants";
import { toDateOnly } from "@/lib/date";

import { prisma } from "@/server/db";
import { emptyContactStats, type ContactStats } from "@/server/mappers/contact.mapper";
import { getPlanSummary, getUpcomingPlans } from "./plan.service";

/**
 * 批量计算联系人统计。
 * 净差额永不落库，全部在这里实时聚合。
 */
export async function contactStatsMap(
  ledgerId: string,
  contactIds: string[],
): Promise<Map<string, ContactStats>> {
  const result = new Map<string, ContactStats>();
  for (const id of contactIds) result.set(id, emptyContactStats());
  if (contactIds.length === 0) return result;

  const grouped = await prisma.record.groupBy({
    by: ["contactId", "direction"],
    where: { ledgerId, contactId: { in: contactIds }, deletedAt: null },
    _sum: { amountCents: true },
    _count: { _all: true },
    _max: { occurredAt: true },
  });

  for (const row of grouped) {
    const stats = result.get(row.contactId);
    if (!stats) continue;

    const sum = row._sum.amountCents ?? 0;
    stats.recordCount += row._count._all;

    if (row.direction === "GIVEN") stats.givenTotalCents += sum;
    else stats.receivedTotalCents += sum;

    if (row._max.occurredAt) {
      const day = toDateOnly(row._max.occurredAt);
      if (!stats.lastRecordAt || day > stats.lastRecordAt) stats.lastRecordAt = day;
    }
  }

  const unsettled = await prisma.record.groupBy({
    by: ["contactId"],
    where: {
      ledgerId,
      contactId: { in: contactIds },
      deletedAt: null,
      direction: "RECEIVED",
      settledAt: null,
    },
    _sum: { amountCents: true },
    _count: { _all: true },
  });

  for (const row of unsettled) {
    const stats = result.get(row.contactId);
    if (!stats) continue;
    stats.unsettledReceivedCount = row._count._all;
    stats.unsettledReceivedCents = row._sum.amountCents ?? 0;
  }

  // 该亲友涉及过哪些礼俗场景，供前端「按礼金性质」筛选
  const scenes = await prisma.record.groupBy({
    by: ["contactId", "scene"],
    where: { ledgerId, contactId: { in: contactIds }, deletedAt: null },
  });

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
  const plans = await prisma.giftPlan.groupBy({
    by: ["contactId"],
    where: { ledgerId, contactId: { in: contactIds }, deletedAt: null, status: "PLANNED" },
    _count: { _all: true },
  });

  for (const row of plans) {
    const stats = result.get(row.contactId);
    if (stats) stats.planCount = row._count._all;
  }

  for (const stats of result.values()) {
    stats.netCents = stats.receivedTotalCents - stats.givenTotalCents;
  }

  return result;
}

export async function getOverview(ledgerId: string) {
  const base = { ledgerId, deletedAt: null };

  const [
    contactCount,
    recordCount,
    given,
    received,
    pending,
    scenes,
    planSummary,
    upcoming,
    eventCount,
  ] = await Promise.all([
    prisma.contact.count({ where: { ledgerId, deletedAt: null } }),
    prisma.record.count({ where: base }),
    prisma.record.aggregate({
      where: { ...base, direction: "GIVEN" },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    prisma.record.aggregate({
      where: { ...base, direction: "RECEIVED" },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    prisma.record.aggregate({
      where: { ...base, direction: "RECEIVED", settledAt: null },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    prisma.record.groupBy({
      by: ["scene"],
      where: base,
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    getPlanSummary(ledgerId),
    getUpcomingPlans(ledgerId, 1),
    prisma.lifeEvent.count({ where: { ledgerId, deletedAt: null } }),
  ]);

  const givenTotalCents = given._sum.amountCents ?? 0;
  const receivedTotalCents = received._sum.amountCents ?? 0;

  const sceneBreakdown = scenes
    .map((row) => ({
      scene: row.scene,
      sceneLabel: SCENE_LABELS[row.scene as GiftScene] ?? row.scene,
      count: row._count._all,
      totalCents: row._sum.amountCents ?? 0,
    }))
    .sort((a, b) => b.totalCents - a.totalCents);

  return {
    ledgerId,
    contactCount,
    recordCount,
    givenCount: given._count._all,
    receivedCount: received._count._all,
    givenTotalCents,
    receivedTotalCents,
    netCents: receivedTotalCents - givenTotalCents,
    pendingReturnCount: pending._count._all,
    pendingReturnCents: pending._sum.amountCents ?? 0,
    planCount: planSummary.planCount,
    planCents: planSummary.planCents,
    nextPlan: upcoming[0] ?? null,
    eventCount,
    sceneBreakdown,
  };
}
