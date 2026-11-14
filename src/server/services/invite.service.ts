import { randomBytes } from "node:crypto";

import { LIMITS } from "@/lib/constants";

import { prisma } from "@/server/db";
import type { LedgerContext } from "@/server/guards/ledger";
import { AppError } from "@/server/http/errors";

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

export async function createInvite(
  ctx: LedgerContext,
  input: { expiresInDays?: number },
) {
  const days = input.expiresInDays ?? LIMITS.inviteExpireDaysDefault;
  const expiresAt = new Date(Date.now() + days * 86_400_000);

  const invite = await prisma.invite.create({
    data: {
      ledgerId: ctx.ledgerId,
      token: randomBytes(16).toString("hex"),
      createdById: ctx.userId,
      expiresAt,
    },
  });

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");

  return {
    token: invite.token,
    url: `${baseUrl}/invite/${invite.token}`,
    expiresAt: invite.expiresAt.toISOString(),
  };
}

export async function getInvite(token: string, userId: string) {
  const invite = await prisma.invite.findUnique({
    where: { token },
    include: {
      ledger: { select: { id: true, name: true, _count: { select: { memberships: true } } } },
      createdBy: { select: { name: true } },
    },
  });
  if (!invite) throw new AppError("INVITE_NOT_FOUND");

  const membership = await prisma.membership.findUnique({
    where: { ledgerId_userId: { ledgerId: invite.ledgerId, userId } },
    select: { id: true },
  });

  return {
    invite: {
      token: invite.token,
      status: deriveInviteStatus(invite),
      ledger: {
        id: invite.ledger.id,
        name: invite.ledger.name,
        memberCount: invite.ledger._count.memberships,
      },
      inviterName: invite.createdBy.name,
      expiresAt: invite.expiresAt.toISOString(),
    },
    alreadyMember: membership !== null,
  };
}

export async function acceptInvite(token: string, userId: string) {
  const result = await prisma.$transaction(async (tx) => {
    const invite = await tx.invite.findUnique({ where: { token } });
    if (!invite) throw new AppError("INVITE_NOT_FOUND");

    const status = deriveInviteStatus(invite);
    if (status !== "PENDING") throw statusToError(status);

    const existing = await tx.membership.findUnique({
      where: { ledgerId_userId: { ledgerId: invite.ledgerId, userId } },
      select: { id: true },
    });

    // 已是成员：幂等返回，且不消耗邀请
    if (existing) {
      return { ledgerId: invite.ledgerId, alreadyMember: true as const };
    }

    // 抢占式消费，保证并发下只有一个请求能成功
    const claimed = await tx.invite.updateMany({
      where: { id: invite.id, usedAt: null, revokedAt: null },
      data: { usedAt: new Date(), usedByUserId: userId },
    });
    if (claimed.count === 0) throw new AppError("INVITE_USED");

    await tx.membership.create({
      data: { ledgerId: invite.ledgerId, userId, role: "MEMBER" },
    });

    return { ledgerId: invite.ledgerId, alreadyMember: false as const };
  });

  const ledger = await prisma.ledger.findUniqueOrThrow({
    where: { id: result.ledgerId },
    select: { id: true, name: true, _count: { select: { memberships: true } } },
  });

  const role = await prisma.membership.findUniqueOrThrow({
    where: { ledgerId_userId: { ledgerId: result.ledgerId, userId } },
    select: { role: true },
  });

  return {
    ledger: {
      id: ledger.id,
      name: ledger.name,
      role: role.role,
      memberCount: ledger._count.memberships,
    },
    alreadyMember: result.alreadyMember,
  };
}

export async function revokeInvite(token: string, userId: string) {
  const invite = await prisma.invite.findUnique({
    where: { token },
    select: { id: true, ledgerId: true, createdById: true, revokedAt: true },
  });
  if (!invite) throw new AppError("INVITE_NOT_FOUND");

  if (invite.createdById !== userId) {
    const membership = await prisma.membership.findUnique({
      where: { ledgerId_userId: { ledgerId: invite.ledgerId, userId } },
      select: { role: true },
    });
    if (membership?.role !== "OWNER") throw new AppError("FORBIDDEN");
  }

  if (!invite.revokedAt) {
    await prisma.invite.update({
      where: { id: invite.id },
      data: { revokedAt: new Date() },
    });
  }

  return { revoked: true };
}
