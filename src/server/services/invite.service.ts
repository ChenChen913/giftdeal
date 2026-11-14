import { randomBytes } from "node:crypto";

import { and, count, eq, isNull } from "drizzle-orm";

import { LIMITS } from "@/lib/constants";

import { db } from "@/server/db-drizzle";
import type { LedgerContext } from "@/server/guards/ledger";
import { AppError } from "@/server/http/errors";
import { invite as inviteTable, ledger as ledgerTable, membership, user } from "@/server/schema";

export type InviteStatus = "PENDING" | "USED" | "EXPIRED" | "REVOKED";

type InviteTimestamps = {
  usedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date;
};

export function deriveInviteStatus(invite: InviteTimestamps, now = new Date()): InviteStatus {
  if (invite.revokedAt) return "REVOKED";
  if (invite.usedAt) return "USED";
  if (invite.expiresAt.getTime() <= now.getTime()) return "EXPIRED";
  return "PENDING";
}

function statusToError(status: InviteStatus): AppError {
  switch (status) {
    case "USED":
      return new AppError("INVITE_USED");
    case "EXPIRED":
      return new AppError("INVITE_EXPIRED");
    case "REVOKED":
      return new AppError("INVITE_REVOKED");
    default:
      return new AppError("INVITE_NOT_FOUND");
  }
}

async function memberCountOf(ledgerId: string): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(membership)
    .where(eq(membership.ledgerId, ledgerId));
  return Number(rows[0]?.n ?? 0);
}

export async function createInvite(
  ctx: LedgerContext,
  input: { expiresInDays?: number },
) {
  const days = input.expiresInDays ?? LIMITS.inviteExpireDaysDefault;
  const expiresAt = new Date(Date.now() + days * 86_400_000);

  const inserted = await db
    .insert(inviteTable)
    .values({
      id: crypto.randomUUID(),
      ledgerId: ctx.ledgerId,
      token: randomBytes(16).toString("hex"),
      createdById: ctx.userId,
      expiresAt,
    })
    .returning();

  const invite = inserted[0];
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");

  return {
    token: invite.token,
    url: `${baseUrl}/invite/${invite.token}`,
    expiresAt: invite.expiresAt.toISOString(),
  };
}

export async function getInvite(token: string, userId: string) {
  const rows = await db
    .select({
      token: inviteTable.token,
      ledgerId: inviteTable.ledgerId,
      expiresAt: inviteTable.expiresAt,
      usedAt: inviteTable.usedAt,
      revokedAt: inviteTable.revokedAt,
      ledgerName: ledgerTable.name,
      inviterName: user.name,
    })
    .from(inviteTable)
    .innerJoin(ledgerTable, eq(inviteTable.ledgerId, ledgerTable.id))
    .innerJoin(user, eq(inviteTable.createdById, user.id))
    .where(eq(inviteTable.token, token))
    .limit(1);

  const invite = rows[0];
  if (!invite) throw new AppError("INVITE_NOT_FOUND");

  const membershipRows = await db
    .select({ id: membership.id })
    .from(membership)
    .where(and(eq(membership.ledgerId, invite.ledgerId), eq(membership.userId, userId)))
    .limit(1);

  return {
    invite: {
      token: invite.token,
      status: deriveInviteStatus(invite),
      ledger: {
        id: invite.ledgerId,
        name: invite.ledgerName,
        memberCount: await memberCountOf(invite.ledgerId),
      },
      inviterName: invite.inviterName,
      expiresAt: invite.expiresAt.toISOString(),
    },
    alreadyMember: membershipRows.length > 0,
  };
}

export async function acceptInvite(token: string, userId: string) {
  const result = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(inviteTable)
      .where(eq(inviteTable.token, token))
      .limit(1);
    const invite = rows[0];
    if (!invite) throw new AppError("INVITE_NOT_FOUND");

    const status = deriveInviteStatus(invite);
    if (status !== "PENDING") throw statusToError(status);

    const existing = await tx
      .select({ id: membership.id })
      .from(membership)
      .where(and(eq(membership.ledgerId, invite.ledgerId), eq(membership.userId, userId)))
      .limit(1);

    // 已是成员：幂等返回，且不消耗邀请
    if (existing.length > 0) {
      return { ledgerId: invite.ledgerId, alreadyMember: true as const };
    }

    // 抢占式消费，保证并发下只有一个请求能成功
    const claimed = await tx
      .update(inviteTable)
      .set({ usedAt: new Date(), usedByUserId: userId })
      .where(and(eq(inviteTable.id, invite.id), isNull(inviteTable.usedAt), isNull(inviteTable.revokedAt)))
      .returning({ id: inviteTable.id });
    if (claimed.length === 0) throw new AppError("INVITE_USED");

    await tx.insert(membership).values({
      id: crypto.randomUUID(),
      ledgerId: invite.ledgerId,
      userId,
      role: "MEMBER",
    });

    return { ledgerId: invite.ledgerId, alreadyMember: false as const };
  });

  const ledgerRows = await db
    .select({ id: ledgerTable.id, name: ledgerTable.name })
    .from(ledgerTable)
    .where(eq(ledgerTable.id, result.ledgerId))
    .limit(1);
  const ledger = ledgerRows[0];
  if (!ledger) throw new AppError("LEDGER_NOT_FOUND");

  const roleRows = await db
    .select({ role: membership.role })
    .from(membership)
    .where(and(eq(membership.ledgerId, result.ledgerId), eq(membership.userId, userId)))
    .limit(1);

  return {
    ledger: {
      id: ledger.id,
      name: ledger.name,
      role: roleRows[0]?.role,
      memberCount: await memberCountOf(result.ledgerId),
    },
    alreadyMember: result.alreadyMember,
  };
}

export async function revokeInvite(token: string, userId: string) {
  const rows = await db
    .select({
      id: inviteTable.id,
      ledgerId: inviteTable.ledgerId,
      createdById: inviteTable.createdById,
      revokedAt: inviteTable.revokedAt,
    })
    .from(inviteTable)
    .where(eq(inviteTable.token, token))
    .limit(1);
  const invite = rows[0];
  if (!invite) throw new AppError("INVITE_NOT_FOUND");

  if (invite.createdById !== userId) {
    const membershipRows = await db
      .select({ role: membership.role })
      .from(membership)
      .where(and(eq(membership.ledgerId, invite.ledgerId), eq(membership.userId, userId)))
      .limit(1);
    if (membershipRows[0]?.role !== "OWNER") throw new AppError("FORBIDDEN");
  }

  if (!invite.revokedAt) {
    await db
      .update(inviteTable)
      .set({ revokedAt: new Date() })
      .where(eq(inviteTable.id, invite.id));
  }

  return { revoked: true };
}
