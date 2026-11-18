// 必须排在 @/server/env 之前：它负责把测试进程固定成 test 环境
import "./helpers/test-env";

import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import test from "node:test";

import { ledger, membership, user } from "@/server/schema";
import { createUser, type Db } from "./helpers/fixtures";
import { startTestDatabase } from "./helpers/test-db";

const database = await startTestDatabase();
const { db } = (await import("@/server/db-drizzle")) as unknown as { db: Db };
const { bootstrapUser } = await import("@/server/bootstrap");

test.beforeEach(async () => {
  await database.reset();
});

test.after(async () => {
  await database.close();
});

test("新用户 bootstrap：账本先于外键更新创建，且幂等不重复入册", async () => {
  const userId = await createUser(db);

  const ledgerId = await bootstrapUser(userId);

  const userRows = await db
    .select({ defaultLedgerId: user.defaultLedgerId })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  assert.equal(userRows[0]?.defaultLedgerId, ledgerId);

  // 曾经出现过「先 UPDATE user.default_ledger_id 再 INSERT ledger」的写法，
  // 会直接违反 user_default_ledger_id_fkey，让注册流程连带失败。
  const ledgerRows = await db.select({ id: ledger.id }).from(ledger).where(eq(ledger.id, ledgerId));
  assert.equal(ledgerRows.length, 1, "默认账本必须真实存在");

  const members = await db
    .select({ role: membership.role })
    .from(membership)
    .where(eq(membership.ledgerId, ledgerId));
  assert.equal(members.length, 1);
  assert.equal(members[0].role, "OWNER");

  // 幂等：再次调用返回同一账本，不产生第二本账 / 第二条成员关系
  assert.equal(await bootstrapUser(userId), ledgerId);
  assert.equal((await db.select().from(ledger)).length, 1);
  assert.equal((await db.select().from(membership)).length, 1);
});

test("test 环境即使存在 seed 演示账本，新用户仍保持独立空账本", async () => {
  // 保护 E2E / smoke 的数据隔离：演示账本同步只能在 development 生效，
  // 否则「每个新会话独立空账本」的前提被破坏，成套用例会失败。
  await db.insert(ledger).values({ id: "led_zhang", name: "张家礼金账" });
  const userId = await createUser(db);

  const ledgerId = await bootstrapUser(userId);
  assert.notEqual(ledgerId, "led_zhang", "测试环境不能共享演示账本");

  const members = await db
    .select({ ledgerId: membership.ledgerId, role: membership.role })
    .from(membership)
    .where(eq(membership.userId, userId));
  assert.equal(members.length, 1);
  assert.equal(members[0].role, "OWNER");
  assert.equal(members[0].ledgerId, ledgerId);
  assert.equal(
    (await db.select().from(membership).where(eq(membership.ledgerId, "led_zhang"))).length,
    0,
    "演示账本不应被塞入新成员",
  );
});
