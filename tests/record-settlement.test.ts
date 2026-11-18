import assert from "node:assert/strict";
import test from "node:test";

import type { LedgerContext } from "@/server/guards/ledger";
import { AppError } from "@/server/http/errors";
import { startTestDatabase } from "./helpers/test-db";
import { createContact, createLedgerFixture, type Db } from "./helpers/fixtures";

const database = await startTestDatabase();
const { db } = (await import("@/server/db-drizzle")) as unknown as { db: Db };
const recordService = await import("@/server/services/record.service");
const settlementService = await import("@/server/services/settlement.service");
const statsService = await import("@/server/services/stats.service");

const baseInput = {
  direction: "RECEIVED" as const,
  amountCents: 100_000,
  scene: "WEDDING" as const,
  occurredAt: "2024-05-01",
};

async function pendingSummary(ctx: LedgerContext) {
  const result = await settlementService.listPendingReturns(ctx, { page: 1, pageSize: 20 });
  return result.summary;
}

test.beforeEach(async () => {
  await database.reset();
});

test.after(async () => {
  await database.close();
});

test("新增收到记录后进入待回礼，手动结清后退出", async () => {
  const { ctx, contactId } = await createLedgerFixture(db);

  const created = await recordService.createRecord(ctx, { ...baseInput, contactId });
  assert.equal(created.record.isSettled, false);
  assert.equal(created.settledRecord, null);

  const before = await pendingSummary(ctx);
  assert.equal(before.totalCount, 1);
  assert.equal(before.totalCents, 100_000);

  const settled = await recordService.settleRecord(ctx, created.record.id);
  assert.equal(settled.isSettled, true);
  assert.equal(settled.settledByRecordId, null);

  const after = await pendingSummary(ctx);
  assert.equal(after.totalCount, 0);
  assert.equal(after.totalCents, 0);
});

test("送出记录关联结清：收礼记录被标记、待回礼归零、重复结清被拒绝", async () => {
  const { ctx, contactId } = await createLedgerFixture(db);
  const received = await recordService.createRecord(ctx, { ...baseInput, contactId });

  const result = await recordService.createRecord(ctx, {
    contactId,
    direction: "GIVEN",
    amountCents: 100_000,
    scene: "WEDDING",
    occurredAt: "2024-06-01",
    settlesRecordId: received.record.id,
  });

  assert.equal(result.record.direction, "GIVEN");
  assert.equal(result.settledRecord?.id, received.record.id);
  assert.equal(result.settledRecord?.isSettled, true);
  assert.equal(result.settledRecord?.settledByRecordId, result.record.id);

  const pending = await pendingSummary(ctx);
  assert.equal(pending.totalCount, 0);

  // 再拿另一笔送出记录去结清同一条收礼：必须失败，且不能多出一条送出记录
  await assert.rejects(
    () =>
      recordService.createRecord(ctx, {
        contactId,
        direction: "GIVEN",
        amountCents: 50_000,
        scene: "WEDDING",
        occurredAt: "2024-06-02",
        settlesRecordId: received.record.id,
      }),
    (error: unknown) => error instanceof AppError && error.code === "RECORD_ALREADY_SETTLED",
  );

  const list = await recordService.listRecords(ctx, { page: 1, pageSize: 50 });
  assert.equal(list.items.filter((item) => item.direction === "GIVEN").length, 1);
});

test("手动结清可以取消，取消后重新回到待回礼", async () => {
  const { ctx, contactId } = await createLedgerFixture(db);
  const received = await recordService.createRecord(ctx, { ...baseInput, contactId });

  await recordService.settleRecord(ctx, received.record.id);
  await assert.rejects(
    () => recordService.settleRecord(ctx, received.record.id),
    (error: unknown) => error instanceof AppError && error.code === "RECORD_ALREADY_SETTLED",
  );

  const unsettled = await recordService.unsettleRecord(ctx, received.record.id);
  assert.equal(unsettled.isSettled, false);

  const pending = await pendingSummary(ctx);
  assert.equal(pending.totalCount, 1);

  await assert.rejects(
    () => recordService.unsettleRecord(ctx, received.record.id),
    (error: unknown) => error instanceof AppError && error.code === "RECORD_NOT_SETTLED",
  );
});

test("只有收到记录可以结清", async () => {
  const { ctx, contactId } = await createLedgerFixture(db);
  const given = await recordService.createRecord(ctx, {
    ...baseInput,
    direction: "GIVEN",
    contactId,
  });

  await assert.rejects(
    () => recordService.settleRecord(ctx, given.record.id),
    (error: unknown) => error instanceof AppError && error.code === "RECORD_NOT_SETTLEABLE",
  );
});

test("删除用于结清的送出记录：收礼回退为未结清，待回礼统计恢复", async () => {
  const { ctx, contactId } = await createLedgerFixture(db);
  const received = await recordService.createRecord(ctx, { ...baseInput, contactId });
  const given = await recordService.createRecord(ctx, {
    contactId,
    direction: "GIVEN",
    amountCents: 100_000,
    scene: "WEDDING",
    occurredAt: "2024-06-01",
    settlesRecordId: received.record.id,
  });

  assert.equal((await pendingSummary(ctx)).totalCount, 0);

  const deleted = await recordService.deleteRecord(ctx, given.record.id);
  assert.equal(deleted.relatedRecordId, received.record.id);

  const after = await recordService.getRecord(ctx, received.record.id);
  assert.equal(after.isSettled, false);
  assert.equal(after.settledByRecordId, null);

  const pending = await pendingSummary(ctx);
  assert.equal(pending.totalCount, 1);
  assert.equal(pending.totalCents, 100_000);
});

test("删除已被结清的收到记录：记录消失，送出记录保留，待回礼不回到清单", async () => {
  const { ctx, contactId } = await createLedgerFixture(db);
  const received = await recordService.createRecord(ctx, { ...baseInput, contactId });
  const given = await recordService.createRecord(ctx, {
    contactId,
    direction: "GIVEN",
    amountCents: 100_000,
    scene: "WEDDING",
    occurredAt: "2024-06-01",
    settlesRecordId: received.record.id,
  });

  const deleted = await recordService.deleteRecord(ctx, received.record.id);
  assert.equal(deleted.relatedRecordId, given.record.id);

  await assert.rejects(
    () => recordService.getRecord(ctx, received.record.id),
    (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND",
  );

  // 送出记录仍然存在，且不再指向已删除的收礼
  const givenAfter = await recordService.getRecord(ctx, given.record.id);
  assert.equal(givenAfter.settlesRecordId, null);

  const pending = await pendingSummary(ctx);
  assert.equal(pending.totalCount, 0);
});

test("同一笔收礼被两个请求并发结清：只有一个成功", async () => {
  const { ctx, contactId } = await createLedgerFixture(db);
  const received = await recordService.createRecord(ctx, { ...baseInput, contactId });

  const results = await Promise.allSettled([
    recordService.settleRecord(ctx, received.record.id),
    recordService.settleRecord(ctx, received.record.id),
  ]);

  const fulfilled = results.filter((item) => item.status === "fulfilled");
  const rejected = results.filter((item) => item.status === "rejected") as PromiseRejectedResult[];

  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal((rejected[0].reason as AppError).code, "RECORD_ALREADY_SETTLED");
});

test("并发用两笔送出记录结清同一笔收礼：只落一条送出记录", async () => {
  const { ctx, contactId } = await createLedgerFixture(db);
  const received = await recordService.createRecord(ctx, { ...baseInput, contactId });

  const payload = {
    contactId,
    direction: "GIVEN" as const,
    amountCents: 100_000,
    scene: "WEDDING" as const,
    occurredAt: "2024-06-01",
    settlesRecordId: received.record.id,
  };

  const results = await Promise.allSettled([
    recordService.createRecord(ctx, payload),
    recordService.createRecord(ctx, payload),
  ]);

  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);

  const list = await recordService.listRecords(ctx, { page: 1, pageSize: 50 });
  assert.equal(list.items.filter((item) => item.direction === "GIVEN").length, 1);
});

test("跨账本关联结清被拒绝，跨账本读取返回 404", async () => {
  const ledgerA = await createLedgerFixture(db, { name: "A 账本" });
  const ledgerB = await createLedgerFixture(db, { name: "B 账本" });
  const contactOfB = await createContact(db, ledgerB.ledgerId, "李四");

  const receivedInA = await recordService.createRecord(ledgerA.ctx, {
    ...baseInput,
    contactId: ledgerA.contactId,
  });

  await assert.rejects(
    () =>
      recordService.createRecord(ledgerB.ctx, {
        contactId: contactOfB,
        direction: "GIVEN",
        amountCents: 100_000,
        scene: "WEDDING",
        occurredAt: "2024-06-01",
        settlesRecordId: receivedInA.record.id,
      }),
    (error: unknown) => error instanceof AppError && error.code === "SETTLE_TARGET_INVALID",
  );

  await assert.rejects(
    () => recordService.getRecord(ledgerB.ctx, receivedInA.record.id),
    (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND",
  );

  // A 账本的统计不受影响
  const pending = await pendingSummary(ledgerA.ctx);
  assert.equal(pending.totalCount, 1);
});

test("结清与软删除后，按人统计与首页汇总同步更新", async () => {
  const { ctx, ledgerId, contactId } = await createLedgerFixture(db);
  const received = await recordService.createRecord(ctx, { ...baseInput, contactId });
  await recordService.settleRecord(ctx, received.record.id);

  const overviewSettled = await statsService.getOverview(ledgerId);
  assert.equal(overviewSettled.pendingReturnCount, 0);
  assert.equal(overviewSettled.receivedTotalCents, 100_000);

  await recordService.deleteRecord(ctx, received.record.id);

  const overviewDeleted = await statsService.getOverview(ledgerId);
  assert.equal(overviewDeleted.recordCount, 0);
  assert.equal(overviewDeleted.receivedTotalCents, 0);

  const contactStats = await statsService.contactStatsMap(ledgerId, [contactId]);
  assert.equal(contactStats.get(contactId)?.recordCount, 0);
});
