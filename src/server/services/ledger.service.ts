import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";

import type { MembershipRole } from "@/lib/constants";
import { maskPhone } from "@/lib/mask";

import { bootstrapUser } from "@/server/bootstrap";
import { db } from "@/server/db-drizzle";
import type { LedgerContext } from "@/server/guards/ledger";
import { requireOwner } from "@/server/guards/ledger";
import { AppError } from "@/server/http/errors";
import {
  contact,
  ledger as ledgerTable,
  membership,
  record,
  user as userTable,
} from "@/server/schema";

export type LedgerSummary = {
  id: string;
  name: string;
  role: MembershipRole;
  memberCount: number;
  contactCount: number;
  recordCount: number;
  isDefault: boolean;
  createdAt: string;
};

function newId(): string {
  return crypto.randomUUID();
}

export async function listMyLedgers(userId: string): Promise<LedgerSummary[]> {
  const memberships = await db.query.membership.findMany({
    where: eq(membership.userId, userId),
    with: { ledger: { columns: { id: true, name: true, createdAt: true } } },
    orderBy: [asc(membership.joinedAt)],
  });

  if (memberships.length === 0) return [];

  const ledgerIds = memberships.map((m) => m.ledgerId);

  const [userRows, memberCounts, contactCounts, recordCounts] = await Promise.all([
    db
      .select({ defaultLedgerId: userTable.defaultLedgerId })
      .from(userTable)
      .where(eq(userTable.id, userId))
      .limit(1),
    db
      .select({ ledgerId: membership.ledgerId, n: count() })
      .from(membership)
      .where(inArray(membership.ledgerId, ledgerIds))
      .groupBy(membership.ledgerId),
    db
      .select({ ledgerId: contact.ledgerId, n: count() })
      .from(contact)
      .where(and(inArray(contact.ledgerId, ledgerIds), isNull(contact.deletedAt)))
      .groupBy(contact.ledgerId),
    db
      .select({ ledgerId: record.ledgerId, n: count() })
      .from(record)
      .where(and(inArray(record.ledgerId, ledgerIds), isNull(record.deletedAt)))
      .groupBy(record.ledgerId),
  ]);

  const toMap = (rows: { ledgerId: string; n: number | string }[]) =>
    new Map(rows.map((row) => [row.ledgerId, Number(row.n)]));

  const memberMap = toMap(memberCounts);
  const contactMap = toMap(contactCounts);
  const recordMap = toMap(recordCounts);
  const defaultLedgerId = userRows[0]?.defaultLedgerId ?? null;

  return memberships.map((m) => ({
    id: m.ledger.id,
    name: m.ledger.name,
    role: m.role as MembershipRole,
    memberCount: memberMap.get(m.ledgerId) ?? 0,
    contactCount: contactMap.get(m.ledgerId) ?? 0,
    recordCount: recordMap.get(m.ledgerId) ?? 0,
    isDefault: defaultLedgerId === m.ledgerId,
    createdAt: m.ledger.createdAt.toISOString(),
  }));
}

export async function createLedger(userId: string, name: string) {
  const created = await db.transaction(async (tx) => {
    const ledgerId = newId();
    const inserted = await tx
      .insert(ledgerTable)
      .values({ id: ledgerId, name })
      .returning();
    await tx.insert(membership).values({ id: newId(), ledgerId, userId, role: "OWNER" });

    const userRows = await tx
      .select({ defaultLedgerId: userTable.defaultLedgerId })
      .from(userTable)
      .where(eq(userTable.id, userId))
      .limit(1);
    if (!userRows[0]?.defaultLedgerId) {
      await tx
        .update(userTable)
        .set({ defaultLedgerId: ledgerId, updatedAt: new Date() })
        .where(eq(userTable.id, userId));
    }

    return inserted[0];
  });

  const userRows = await db
    .select({ defaultLedgerId: userTable.defaultLedgerId })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);

  return {
    id: created.id,
    name: created.name,
    role: "OWNER" as MembershipRole,
    memberCount: 1,
    isDefault: userRows[0]?.defaultLedgerId === created.id,
    createdAt: created.createdAt.toISOString(),
  };
}

export async function getLedgerDetail(ctx: LedgerContext) {
  const ledgerRows = await db
    .select({ id: ledgerTable.id, name: ledgerTable.name, createdAt: ledgerTable.createdAt })
    .from(ledgerTable)
    .where(eq(ledgerTable.id, ctx.ledgerId))
    .limit(1);
  const ledger = ledgerRows[0];
  if (!ledger) throw new AppError("LEDGER_NOT_FOUND");

  const memberships = await db.query.membership.findMany({
    where: eq(membership.ledgerId, ctx.ledgerId),
    with: { user: { columns: { id: true, name: true, phoneNumber: true } } },
    orderBy: [asc(membership.joinedAt)],
  });

  return {
    id: ledger.id,
    name: ledger.name,
    role: ctx.role,
    createdAt: ledger.createdAt.toISOString(),
    members: memberships.map((m) => ({
      userId: m.user.id,
      name: m.user.name,
      phoneNumberMasked: maskPhone(m.user.phoneNumber),
      role: m.role as MembershipRole,
      joinedAt: m.joinedAt.toISOString(),
    })),
  };
}

export async function renameLedger(ctx: LedgerContext, name: string) {
  requireOwner(ctx);

  const updated = await db
    .update(ledgerTable)
    .set({ name, updatedAt: new Date() })
    .where(eq(ledgerTable.id, ctx.ledgerId))
    .returning();

  const ledger = updated[0];
  if (!ledger) throw new AppError("LEDGER_NOT_FOUND");
  return {
    id: ledger.id,
    name: ledger.name,
    role: ctx.role,
    createdAt: ledger.createdAt.toISOString(),
  };
}

/**
 * 退出账本。
 * OWNER 不能直接退出：账本会失去管理员，所以必须先转让。
 * 退出的是默认账本时，把默认账本指向剩下的第一本；一本都不剩才置空，
 * 由 /me 的 bootstrap 兜底建新账本。
 */
export async function leaveLedger(ctx: LedgerContext) {
  if (ctx.role === "OWNER") {
    const rows = await db
      .select({ n: count() })
      .from(membership)
      .where(eq(membership.ledgerId, ctx.ledgerId));
    const memberCount = Number(rows[0]?.n ?? 0);
    throw new AppError(
      "CONFLICT",
      undefined,
      memberCount > 1
        ? "你是该账本的管理员，请先把管理员转让给其他成员再退出"
        : "你是该账本唯一的管理员，无法退出",
    );
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(membership)
      .where(and(eq(membership.ledgerId, ctx.ledgerId), eq(membership.userId, ctx.userId)));

    const userRows = await tx
      .select({ defaultLedgerId: userTable.defaultLedgerId })
      .from(userTable)
      .where(eq(userTable.id, ctx.userId))
      .limit(1);

    if (userRows[0]?.defaultLedgerId === ctx.ledgerId) {
      const next = await tx
        .select({ ledgerId: membership.ledgerId })
        .from(membership)
        .where(eq(membership.userId, ctx.userId))
        .orderBy(asc(membership.joinedAt))
        .limit(1);
      await tx
        .update(userTable)
        .set({ defaultLedgerId: next[0]?.ledgerId ?? null, updatedAt: new Date() })
        .where(eq(userTable.id, ctx.userId));
    }
  });

  return { left: true };
}

/** 转让管理员：仅当前 OWNER 可操作，目标必须已是本账本成员 */
export async function transferOwnership(ctx: LedgerContext, targetUserId: string) {
  requireOwner(ctx);

  if (targetUserId === ctx.userId) {
    throw new AppError("VALIDATION_ERROR", {
      fieldErrors: { userId: ["不能转让给自己"] },
    });
  }

  return db.transaction(async (tx) => {
    const targetRows = await tx
      .select({ id: membership.id })
      .from(membership)
      .where(and(eq(membership.ledgerId, ctx.ledgerId), eq(membership.userId, targetUserId)))
      .limit(1);
    if (targetRows.length === 0) throw new AppError("NOT_FOUND", undefined, "该用户不是本账本成员");

    // 条件更新：并发下只有一个请求能把 OWNER 交出去
    const demoted = await tx
      .update(membership)
      .set({ role: "MEMBER" })
      .where(
        and(
          eq(membership.ledgerId, ctx.ledgerId),
          eq(membership.userId, ctx.userId),
          eq(membership.role, "OWNER"),
        ),
      )
      .returning({ id: membership.id });
    if (demoted.length === 0) {
      throw new AppError("FORBIDDEN", undefined, "你已不是该账本管理员");
    }

    const promoted = await tx
      .update(membership)
      .set({ role: "OWNER" })
      .where(and(eq(membership.ledgerId, ctx.ledgerId), eq(membership.userId, targetUserId)))
      .returning({ id: membership.id });
    // 目标成员在事务中被移除时要整体回滚，不能留下没有 OWNER 的账本
    if (promoted.length === 0) throw new AppError("NOT_FOUND", undefined, "该用户不是本账本成员");

    return { transferred: true, newOwnerId: targetUserId };
  });
}

export async function setDefaultLedger(userId: string, ledgerId: string) {
  const rows = await db
    .select({ id: membership.id })
    .from(membership)
    .where(and(eq(membership.ledgerId, ledgerId), eq(membership.userId, userId)))
    .limit(1);
  if (rows.length === 0) throw new AppError("LEDGER_FORBIDDEN");

  await db
    .update(userTable)
    .set({ defaultLedgerId: ledgerId, updatedAt: new Date() })
    .where(eq(userTable.id, userId));
}

export async function getMe(userId: string) {
  const defaultLedgerId = await bootstrapUser(userId);

  const [userRows, ledgers] = await Promise.all([
    db
      .select({
        id: userTable.id,
        name: userTable.name,
        phoneNumber: userTable.phoneNumber,
        createdAt: userTable.createdAt,
      })
      .from(userTable)
      .where(eq(userTable.id, userId))
      .limit(1),
    listMyLedgers(userId),
  ]);

  const user = userRows[0];
  if (!user) throw new AppError("NOT_FOUND");

  return {
    user: {
      id: user.id,
      name: user.name,
      phoneNumber: user.phoneNumber,
      createdAt: user.createdAt.toISOString(),
    },
    defaultLedgerId,
    ledgers: ledgers.map((l) => ({
      id: l.id,
      name: l.name,
      role: l.role,
      memberCount: l.memberCount,
      isDefault: l.id === defaultLedgerId,
    })),
  };
}
