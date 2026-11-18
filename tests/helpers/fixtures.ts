/**
 * 测试夹具：直接往临时库里写最小的用户 / 账本 / 亲友数据。
 * 不走 Better Auth，避免为了造数据引入会话与短信依赖。
 */

import { randomUUID } from "node:crypto";

import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { LedgerContext } from "@/server/guards/ledger";
import { contact, ledger, membership, user } from "@/server/schema";
import type * as schema from "@/server/schema";

export type Db = NodePgDatabase<typeof schema>;

export type LedgerFixture = {
  userId: string;
  ledgerId: string;
  contactId: string;
  ctx: LedgerContext;
};

let phoneCounter = 0;

function nextPhone(): string {
  phoneCounter += 1;
  // 保证同一测试进程内唯一；带随机位避免并行测试文件之间撞号（不同库，其实不会撞）
  return `+8613${String(10000000 + phoneCounter).slice(-8)}`;
}

export async function createUser(db: Db, name = "测试用户"): Promise<string> {
  const id = `usr_${randomUUID()}`;
  await db.insert(user).values({
    id,
    name,
    email: `${id}@test.local`,
    phoneNumber: nextPhone(),
    phoneNumberVerified: true,
  });
  return id;
}

export async function createLedgerForUser(
  db: Db,
  userId: string,
  name = "测试账本",
  role: "OWNER" | "MEMBER" = "OWNER",
): Promise<string> {
  const ledgerId = `led_${randomUUID()}`;
  await db.insert(ledger).values({ id: ledgerId, name });
  await db.insert(membership).values({
    id: `mem_${randomUUID()}`,
    ledgerId,
    userId,
    role,
  });
  return ledgerId;
}

export async function createContact(
  db: Db,
  ledgerId: string,
  name = "王建国",
): Promise<string> {
  const id = `con_${randomUUID()}`;
  await db.insert(contact).values({ id, ledgerId, name });
  return id;
}

/** 一次性造好「一个用户 + 一本账 + 一位亲友」的常用场景 */
export async function createLedgerFixture(
  db: Db,
  options: { name?: string; contactName?: string } = {},
): Promise<LedgerFixture> {
  const userId = await createUser(db);
  const ledgerId = await createLedgerForUser(db, userId, options.name ?? "测试账本");
  const contactId = await createContact(db, ledgerId, options.contactName ?? "王建国");
  return {
    userId,
    ledgerId,
    contactId,
    ctx: { userId, ledgerId, role: "OWNER" },
  };
}

export function asMember(ctx: LedgerContext, userId: string): LedgerContext {
  return { ...ctx, userId, role: "MEMBER" };
}
