import assert from "node:assert/strict";
import { eq, sql } from "drizzle-orm";
import test from "node:test";

import { AppError } from "@/server/http/errors";
import { giftPlan, record } from "@/server/schema";
import { startTestDatabase } from "./helpers/test-db";
import { createLedgerFixture, type Db } from "./helpers/fixtures";

const database = await startTestDatabase();
const { db } = (await import("@/server/db-drizzle")) as unknown as { db: Db };
const planService = await import("@/server/services/plan.service");
const recordService = await import("@/server/services/record.service");
const statsService = await import("@/server/services/stats.service");

const planInput = {
  direction: "GIVEN" as const,
  scene: "WEDDING" as const,
  plannedCents: 80_000,
  expectedAt: "2030-05-01",
};

async function recordCount(ledgerId: string): Promise<number> {
  const overview = await statsService.getOverview(ledgerId);
  return overview.recordCount;
}

test.beforeEach(async () => {
  await database.reset();
});

test.after(async () => {
  await database.close();
});

test("创建 / 修改 / 删除预备：不计入收支", async () => {
  const { ctx, ledgerId, contactId } = await createLedgerFixture(db);

  const created = await planService.createPlan(ctx, { ...planInput, contactId });
  assert.equal(created.status, "PLANNED");
  assert.equal(created.plannedCents, 80_000);

  const updated = await planService.updatePlan(ctx, created.id, { plannedCents: 120_000 });
  assert.equal(updated.plannedCents, 120_000);

  const overview = await statsService.getOverview(ledgerId);
  assert.equal(overview.planCount, 1);
  assert.equal(overview.planCents, 120_000);
  assert.equal(overview.recordCount, 0, "预备不能计入真实记录");

  await planService.deletePlan(ctx, created.id);
  const afterDelete = await planService.listPlans(ctx, {
    status: "ALL",
    page: 1,
    pageSize: 20,
  });
  assert.equal(afterDelete.items.length, 0);

  const overviewAfter = await statsService.getOverview(ledgerId);
  assert.equal(overviewAfter.planCount, 0);
});

test("完成预备并生成真实礼金记录：金额、方向、关联都对", async () => {
  const { ctx, ledgerId, contactId } = await createLedgerFixture(db);
  const plan = await planService.createPlan(ctx, { ...planInput, contactId });

  const completed = await planService.completePlan(ctx, plan.id, {
    createRecord: true,
    occurredAt: "2030-05-02",
  });

  assert.equal(completed.plan.status, "DONE");
  assert.ok(completed.plan.completedAt);
  assert.ok(completed.record);
  assert.equal(completed.record?.amountCents, 80_000);
  assert.equal(completed.record?.direction, "GIVEN");
  assert.equal(completed.record?.contactId, contactId);
  assert.equal(completed.record?.occurredAt, "2030-05-02");
  assert.equal(completed.plan.recordId, completed.record?.id);

  const overview = await statsService.getOverview(ledgerId);
  assert.equal(overview.recordCount, 1);
  assert.equal(overview.planCount, 0, "完成的预备不再计入待办统计");
  assert.equal(overview.givenTotalCents, 80_000);
});

test("完成时可以改实际金额；也可以只标记完成不生成记录", async () => {
  const { ctx, ledgerId, contactId } = await createLedgerFixture(db);

  const planA = await planService.createPlan(ctx, { ...planInput, contactId });
  const completedA = await planService.completePlan(ctx, planA.id, {
    createRecord: true,
    amountCents: 100_000,
  });
  assert.equal(completedA.record?.amountCents, 100_000);

  const planB = await planService.createPlan(ctx, { ...planInput, contactId });
  const completedB = await planService.completePlan(ctx, planB.id, { createRecord: false });
  assert.equal(completedB.plan.status, "DONE");
  assert.equal(completedB.record, null);
  assert.equal(completedB.plan.recordId, null);

  assert.equal(await recordCount(ledgerId), 1);
});

test("重复完成被拒绝，且不会产生第二条记录", async () => {
  const { ctx, ledgerId, contactId } = await createLedgerFixture(db);
  const plan = await planService.createPlan(ctx, { ...planInput, contactId });

  await planService.completePlan(ctx, plan.id, { createRecord: true });

  await assert.rejects(
    () => planService.completePlan(ctx, plan.id, { createRecord: true }),
    (error: unknown) => error instanceof AppError && error.code === "CONFLICT",
  );

  assert.equal(await recordCount(ledgerId), 1);
});

test("已完成的预备不能再修改", async () => {
  const { ctx, contactId } = await createLedgerFixture(db);
  const plan = await planService.createPlan(ctx, { ...planInput, contactId });
  await planService.completePlan(ctx, plan.id, { createRecord: false });

  await assert.rejects(
    () => planService.updatePlan(ctx, plan.id, { plannedCents: 1_000 }),
    (error: unknown) => error instanceof AppError && error.code === "CONFLICT",
  );
});

test("完成时数据库异常：整体回滚，预备仍是待办、没有半条记录", async () => {
  const { ctx, ledgerId, contactId } = await createLedgerFixture(db);
  const plan = await planService.createPlan(ctx, {
    ...planInput,
    contactId,
    note: "ROLLBACK-CASE",
  });

  // 用一个临时约束模拟「写记录时数据库报错」
  await db.execute(
    sql`alter table record add constraint test_reject_note check (note is null or note <> 'ROLLBACK-CASE')`,
  );
  try {
    await assert.rejects(() => planService.completePlan(ctx, plan.id, { createRecord: true }));
  } finally {
    await db.execute(sql`alter table record drop constraint test_reject_note`);
  }

  const after = await planService.getPlan(ctx, plan.id);
  assert.equal(after.status, "PLANNED");
  assert.equal(after.recordId, null);
  assert.equal(await recordCount(ledgerId), 0);
});

test("两个请求同时完成同一笔预备：只成功一次、只生成一条记录", async () => {
  const { ctx, ledgerId, contactId } = await createLedgerFixture(db);
  const plan = await planService.createPlan(ctx, { ...planInput, contactId });

  const results = await Promise.allSettled([
    planService.completePlan(ctx, plan.id, { createRecord: true }),
    planService.completePlan(ctx, plan.id, { createRecord: true }),
  ]);

  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(results.filter((item) => item.status === "rejected").length, 1);
  assert.equal(await recordCount(ledgerId), 1);
});

test("删除预备不影响已生成的真实记录；删除后不能完成", async () => {
  const { ctx, ledgerId, contactId } = await createLedgerFixture(db);
  const plan = await planService.createPlan(ctx, { ...planInput, contactId });
  const completed = await planService.completePlan(ctx, plan.id, { createRecord: true });

  await planService.deletePlan(ctx, plan.id);

  const recordAfterDelete = await recordService.getRecord(ctx, completed.record!.id);
  assert.equal(recordAfterDelete.id, completed.record!.id);
  assert.equal(await recordCount(ledgerId), 1);

  const pendingPlan = await planService.createPlan(ctx, { ...planInput, contactId });
  await planService.deletePlan(ctx, pendingPlan.id);
  await assert.rejects(
    () => planService.completePlan(ctx, pendingPlan.id, { createRecord: false }),
    (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND",
  );
});

test("跨账本不能修改 / 删除 / 完成别人的预备", async () => {
  const ledgerA = await createLedgerFixture(db, { name: "A" });
  const ledgerB = await createLedgerFixture(db, { name: "B" });

  const plan = await planService.createPlan(ledgerA.ctx, {
    ...planInput,
    contactId: ledgerA.contactId,
  });

  await assert.rejects(
    () => planService.updatePlan(ledgerB.ctx, plan.id, { plannedCents: 1_000 }),
    (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND",
  );
  await assert.rejects(
    () => planService.completePlan(ledgerB.ctx, plan.id, { createRecord: true }),
    (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND",
  );
  await assert.rejects(
    () => planService.deletePlan(ledgerB.ctx, plan.id),
    (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND",
  );
});

test("已完成预备再次修改：CONFLICT，数据库字段保持完成时的状态", async () => {
  const { ctx, contactId } = await createLedgerFixture(db);
  const plan = await planService.createPlan(ctx, { ...planInput, contactId });
  await planService.completePlan(ctx, plan.id, { createRecord: true, amountCents: 90_000 });

  await assert.rejects(
    () => planService.updatePlan(ctx, plan.id, { plannedCents: 1_000 }),
    (error: unknown) => error instanceof AppError && error.code === "CONFLICT",
  );

  const [row] = await db.select().from(giftPlan).where(eq(giftPlan.id, plan.id)).limit(1);
  assert.equal(row.status, "DONE");
  assert.equal(row.plannedCents, 80_000, "修改不能落到已完成的预备上");
  assert.ok(row.recordId);
});

test("已删除预备再次修改：NOT_FOUND，不会把软删数据写回", async () => {
  const { ctx, contactId } = await createLedgerFixture(db);
  const plan = await planService.createPlan(ctx, { ...planInput, contactId });
  await planService.deletePlan(ctx, plan.id);

  await assert.rejects(
    () => planService.updatePlan(ctx, plan.id, { plannedCents: 1_000 }),
    (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND",
  );

  const [row] = await db.select().from(giftPlan).where(eq(giftPlan.id, plan.id)).limit(1);
  assert.ok(row.deletedAt, "软删标记必须保留");
  assert.equal(row.plannedCents, 80_000);
});

test("并发「修改 + 完成」：最终只有一条记录，状态与记录关联一致", async () => {
  const { ctx, ledgerId, contactId } = await createLedgerFixture(db);
  const plan = await planService.createPlan(ctx, { ...planInput, contactId });

  const [updateResult, completeResult] = await Promise.allSettled([
    planService.updatePlan(ctx, plan.id, { plannedCents: 123_456 }),
    planService.completePlan(ctx, plan.id, { createRecord: true }),
  ]);

  assert.equal(completeResult.status, "fulfilled", "完成请求必须成功");
  assert.equal(await recordCount(ledgerId), 1, "不能生成两条记录");

  const [row] = await db.select().from(giftPlan).where(eq(giftPlan.id, plan.id)).limit(1);
  assert.equal(row.status, "DONE");
  assert.ok(row.recordId);

  const [recordRow] = await db
    .select({ id: record.id, amountCents: record.amountCents })
    .from(record)
    .where(eq(record.id, row.recordId!))
    .limit(1);

  if (updateResult.status === "fulfilled") {
    // 修改先落库：完成时使用的是修改后的金额
    assert.equal(row.plannedCents, 123_456);
    assert.equal(recordRow.amountCents, 123_456);
  } else {
    // 完成先落库：修改被条件更新拒绝，金额保持原值
    assert.equal((updateResult.reason as AppError).code, "CONFLICT");
    assert.equal(row.plannedCents, 80_000);
    assert.equal(recordRow.amountCents, 80_000);
  }
});

test("并发「删除 + 完成」：不会留下半条记录，也不会出现已完成但无记录的脏状态", async () => {
  const { ctx, ledgerId, contactId } = await createLedgerFixture(db);
  const plan = await planService.createPlan(ctx, { ...planInput, contactId });

  const [deleteResult, completeResult] = await Promise.allSettled([
    planService.deletePlan(ctx, plan.id),
    planService.completePlan(ctx, plan.id, { createRecord: true }),
  ]);

  assert.equal(deleteResult.status, "fulfilled", "删除请求必须成功");

  const [row] = await db.select().from(giftPlan).where(eq(giftPlan.id, plan.id)).limit(1);
  assert.ok(row.deletedAt, "预备最终必须是软删状态");

  const count = await recordCount(ledgerId);
  assert.ok(count <= 1, "最多生成一条记录");

  if (completeResult.status === "fulfilled") {
    assert.equal(count, 1);
    assert.equal(row.status, "DONE");
    assert.equal(row.recordId, completeResult.value.record!.id);
  } else {
    assert.equal((completeResult.reason as AppError).code, "NOT_FOUND");
    assert.equal(count, 0);
    assert.equal(row.status, "PLANNED");
    assert.equal(row.recordId, null);
  }
});
