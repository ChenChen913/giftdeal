import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import test from "node:test";

import { AppError } from "@/server/http/errors";
import { invite as inviteTable, membership } from "@/server/schema";
import { startTestDatabase } from "./helpers/test-db";
import {
  createLedgerFixture,
  createLedgerForUser,
  createUser,
  type Db,
} from "./helpers/fixtures";

const database = await startTestDatabase();
const { db } = (await import("@/server/db-drizzle")) as unknown as { db: Db };
const inviteService = await import("@/server/services/invite.service");
const contactService = await import("@/server/services/contact.service");
// guards 会间接引入 db，必须在 DATABASE_URL 指向测试库之后再加载
const { requireOwner } = await import("@/server/guards/ledger");

test.beforeEach(async () => {
  await database.reset();
});

test.after(async () => {
  await database.close();
});

test("创建邀请 → 接受后成为普通成员", async () => {
  const { ctx, ledgerId } = await createLedgerFixture(db);
  const inviteeId = await createUser(db, "李娜");

  const created = await inviteService.createInvite(ctx, {});
  assert.match(created.token, /^[0-9a-f]{32}$/);

  const preview = await inviteService.getInvite(created.token, inviteeId);
  assert.equal(preview.invite.status, "PENDING");
  assert.equal(preview.alreadyMember, false);
  assert.equal(preview.invite.ledger.id, ledgerId);

  const accepted = await inviteService.acceptInvite(created.token, inviteeId);
  assert.equal(accepted.alreadyMember, false);
  assert.equal(accepted.ledger.role, "MEMBER");
  assert.equal(accepted.ledger.memberCount, 2);
});

test("已是成员再接受邀请：幂等成功，不重复入册", async () => {
  const { ctx } = await createLedgerFixture(db);
  const inviteeId = await createUser(db, "李娜");
  const created = await inviteService.createInvite(ctx, {});

  await inviteService.acceptInvite(created.token, inviteeId);

  const again = await inviteService.acceptInvite(created.token, inviteeId);
  assert.equal(again.alreadyMember, true);

  const rows = await db.select().from(membership).where(eq(membership.userId, inviteeId));
  assert.equal(rows.length, 1);
});

test("全部成员都已是成员时，新的邀请也能识别 alreadyMember", async () => {
  const { ctx } = await createLedgerFixture(db);
  const inviteeId = await createUser(db, "李娜");
  await inviteService.acceptInvite((await inviteService.createInvite(ctx, {})).token, inviteeId);

  const another = await inviteService.createInvite(ctx, {});
  const preview = await inviteService.getInvite(another.token, inviteeId);
  assert.equal(preview.alreadyMember, true);
  assert.equal(preview.invite.ledger.memberCount, 2);
});

test("过期邀请被拒绝", async () => {
  const { ctx } = await createLedgerFixture(db);
  const inviteeId = await createUser(db, "李娜");
  const created = await inviteService.createInvite(ctx, {});

  await db
    .update(inviteTable)
    .set({ expiresAt: new Date(Date.now() - 60_000) })
    .where(eq(inviteTable.token, created.token));

  await assert.rejects(
    () => inviteService.acceptInvite(created.token, inviteeId),
    (error: unknown) => error instanceof AppError && error.code === "INVITE_EXPIRED",
  );
});

test("已撤销邀请被拒绝，撤销后状态为 REVOKED", async () => {
  const { ctx } = await createLedgerFixture(db);
  const inviteeId = await createUser(db, "李娜");
  const created = await inviteService.createInvite(ctx, {});

  await inviteService.revokeInvite(created.token, ctx.userId);

  const preview = await inviteService.getInvite(created.token, inviteeId);
  assert.equal(preview.invite.status, "REVOKED");

  await assert.rejects(
    () => inviteService.acceptInvite(created.token, inviteeId),
    (error: unknown) => error instanceof AppError && error.code === "INVITE_REVOKED",
  );
});

test("两个用户同时接受同一个邀请：只加入一个人", async () => {
  const { ctx, ledgerId } = await createLedgerFixture(db);
  const firstId = await createUser(db, "李娜");
  const secondId = await createUser(db, "王强");
  const created = await inviteService.createInvite(ctx, {});

  const results = await Promise.allSettled([
    inviteService.acceptInvite(created.token, firstId),
    inviteService.acceptInvite(created.token, secondId),
  ]);

  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  const rejected = results.filter((item) => item.status === "rejected") as PromiseRejectedResult[];
  assert.equal((rejected[0].reason as AppError).code, "INVITE_USED");

  const rows = await db.select().from(membership).where(eq(membership.ledgerId, ledgerId));
  assert.equal(rows.length, 2, "创建者 + 一位受邀者");
});

test("普通成员不能撤销别人创建的邀请，管理员可以", async () => {
  const { ctx, ledgerId } = await createLedgerFixture(db);
  const memberId = await createUser(db, "李娜");
  const invite = await inviteService.createInvite(ctx, {});
  await inviteService.acceptInvite(invite.token, memberId);

  // 管理员再建一个邀请，普通成员尝试撤销
  const ownerInvite = await inviteService.createInvite(ctx, {});
  await assert.rejects(
    () => inviteService.revokeInvite(ownerInvite.token, memberId),
    (error: unknown) => error instanceof AppError && error.code === "FORBIDDEN",
  );

  // 管理员可以撤销
  await inviteService.revokeInvite(ownerInvite.token, ctx.userId);

  const memberCtx = { userId: memberId, ledgerId, role: "MEMBER" as const };
  assert.throws(() => requireOwner(memberCtx), (error: unknown) => error instanceof AppError);
});

test("不同账本之间数据隔离：非成员读不到、也改不了别人的数据", async () => {
  const ledgerA = await createLedgerFixture(db, { name: "A 账本" });
  const outsiderId = await createUser(db, "外人");
  const ledgerB = await createLedgerForUser(db, outsiderId, "B 账本");
  const outsiderCtx = { userId: outsiderId, ledgerId: ledgerB, role: "OWNER" as const };

  await assert.rejects(
    () => contactService.getContact(outsiderCtx, ledgerA.contactId),
    (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND",
  );
  await assert.rejects(
    () => contactService.updateContact(outsiderCtx, ledgerA.contactId, { name: "改名" }),
    (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND",
  );
  await assert.rejects(
    () => contactService.deleteContact(outsiderCtx, ledgerA.contactId),
    (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND",
  );

  const stillThere = await contactService.getContact(ledgerA.ctx, ledgerA.contactId);
  assert.equal(stillThere.name, "王建国");
});
