import assert from "node:assert/strict";
import test from "node:test";

import { eq } from "drizzle-orm";

import { startTestDatabase } from "./helpers/test-db";
import { type Db } from "./helpers/fixtures";

const database = await startTestDatabase();
const { db } = (await import("@/server/db-drizzle")) as unknown as { db: Db };
const throttle = await import("@/server/throttle");
const { throttle: throttleTable } = await import("@/server/schema");

test.beforeEach(async () => {
  await database.reset();
});

test.after(async () => {
  await database.close();
});

test("手机号限流键使用稳定摘要，不包含明文号码", () => {
  const phone = "+8613800000001";
  const key = throttle.throttleKeys.otpSend(phone);

  assert.ok(!key.includes(phone));
  assert.ok(!key.includes(phone.replace(/\D/g, "")));
  assert.equal(key, throttle.throttleKeys.otpSend(phone), "同一号码必须稳定");
  assert.notEqual(key, throttle.throttleKeys.otpSend("+8613800000002"));
  assert.match(key, /^otp-send:[A-Za-z0-9_-]{32}$/);
});

test("固定窗口语义：limit=1 时第一次允许、第二次拒绝", async () => {
  const key = `test-window:${Date.now()}`;

  const first = await throttle.consumeThrottle(key, 1, 60);
  assert.equal(first.allowed, true);
  assert.equal(first.count, 1);

  const second = await throttle.consumeThrottle(key, 1, 60);
  assert.equal(second.allowed, false);
  assert.equal(second.count, 2);
  assert.ok(second.retryAfterSeconds > 0);
});

test("并发消费同一键：计数不会丢失", async () => {
  const key = `test-concurrent:${Date.now()}`;

  await Promise.all(
    Array.from({ length: 5 }, () => throttle.consumeThrottle(key, 10, 60)),
  );

  const state = await throttle.readThrottle(key, 10, 60);
  assert.equal(state.count, 5);
});

test("清理只删除超过保留期的记录，保留仍在窗口内的计数", async () => {
  const activeKey = `active:${Date.now()}`;
  const staleKey = `stale:${Date.now()}`;

  await db.insert(throttleTable).values({
    key: activeKey,
    count: 2,
    windowStart: new Date(),
  });
  await db.insert(throttleTable).values({
    key: staleKey,
    count: 3,
    windowStart: new Date(Date.now() - throttle.THROTTLE_RETENTION_MS - 60_000),
  });

  const removed = await throttle.cleanupExpiredThrottle();
  assert.ok(removed >= 1);

  const activeRows = await db
    .select()
    .from(throttleTable)
    .where(eq(throttleTable.key, activeKey));
  assert.equal(activeRows.length, 1);
  assert.equal(activeRows[0].count, 2);

  const staleRows = await db
    .select()
    .from(throttleTable)
    .where(eq(throttleTable.key, staleKey));
  assert.equal(staleRows.length, 0);
});
