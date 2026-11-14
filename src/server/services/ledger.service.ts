import type { MembershipRole } from "@/lib/constants";

import { bootstrapUser } from "@/server/bootstrap";
import { prisma } from "@/server/db";
import type { LedgerContext } from "@/server/guards/ledger";
import { AppError } from "@/server/http/errors";
import { requireOwner } from "@/server/guards/ledger";

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

export async function listMyLedgers(userId: string): Promise<LedgerSummary[]> {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    include: { ledger: { select: { id: true, name: true, createdAt: true } } },
    orderBy: { joinedAt: "asc" },
  });

  if (memberships.length === 0) return [];

  const ledgerIds = memberships.map((m) => m.ledgerId);

  const [user, memberCounts, contactCounts, recordCounts] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { defaultLedgerId: true } }),
    prisma.membership.groupBy({
      by: ["ledgerId"],
      where: { ledgerId: { in: ledgerIds } },
      _count: { _all: true },
    }),
    prisma.contact.groupBy({
      by: ["ledgerId"],
      where: { ledgerId: { in: ledgerIds }, deletedAt: null },
      _count: { _all: true },
    }),
    prisma.record.groupBy({
      by: ["ledgerId"],
      where: { ledgerId: { in: ledgerIds }, deletedAt: null },
      _count: { _all: true },
    }),
  ]);

  const toMap = (rows: { ledgerId: string; _count: { _all: number } }[]) =>
    new Map(rows.map((row) => [row.ledgerId, row._count._all]));

  const memberMap = toMap(memberCounts);
  const contactMap = toMap(contactCounts);
  const recordMap = toMap(recordCounts);

  return memberships.map((membership) => ({
    id: membership.ledger.id,
    name: membership.ledger.name,
    role: membership.role as MembershipRole,
    memberCount: memberMap.get(membership.ledgerId) ?? 0,
    contactCount: contactMap.get(membership.ledgerId) ?? 0,
    recordCount: recordMap.get(membership.ledgerId) ?? 0,
    isDefault: user?.defaultLedgerId === membership.ledgerId,
    createdAt: membership.ledger.createdAt.toISOString(),
  }));
}

export async function createLedger(userId: string, name: string) {
  const ledger = await prisma.$transaction(async (tx) => {
    const created = await tx.ledger.create({ data: { name } });
    await tx.membership.create({
      data: { ledgerId: created.id, userId, role: "OWNER" },
    });

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { defaultLedgerId: true },
    });
    if (!user?.defaultLedgerId) {
      await tx.user.update({
        where: { id: userId },
        data: { defaultLedgerId: created.id },
      });
    }

    return created;
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultLedgerId: true },
  });

  return {
    id: ledger.id,
    name: ledger.name,
    role: "OWNER" as MembershipRole,
    memberCount: 1,
    isDefault: user?.defaultLedgerId === ledger.id,
    createdAt: ledger.createdAt.toISOString(),
  };
}

export async function getLedgerDetail(ctx: LedgerContext) {
  const ledger = await prisma.ledger.findUnique({
    where: { id: ctx.ledgerId },
    include: {
      memberships: {
        include: { user: { select: { id: true, name: true, phoneNumber: true } } },
        orderBy: { joinedAt: "asc" },
      },
    },
  });
  if (!ledger) throw new AppError("LEDGER_NOT_FOUND");

  return {
    id: ledger.id,
    name: ledger.name,
    role: ctx.role,
    createdAt: ledger.createdAt.toISOString(),
    members: ledger.memberships.map((membership) => ({
      userId: membership.user.id,
      name: membership.user.name,
      phoneNumberMasked: maskPhone(membership.user.phoneNumber),
      role: membership.role as MembershipRole,
      joinedAt: membership.joinedAt.toISOString(),
    })),
  };
}

export async function renameLedger(ctx: LedgerContext, name: string) {
  requireOwner(ctx);

  const ledger = await prisma.ledger.update({
    where: { id: ctx.ledgerId },
    data: { name },
  });

  return {
    id: ledger.id,
    name: ledger.name,
    role: ctx.role,
    createdAt: ledger.createdAt.toISOString(),
  };
}

export async function setDefaultLedger(userId: string, ledgerId: string) {
  const membership = await prisma.membership.findUnique({
    where: { ledgerId_userId: { ledgerId, userId } },
    select: { id: true },
  });
  if (!membership) throw new AppError("LEDGER_FORBIDDEN");

  await prisma.user.update({ where: { id: userId }, data: { defaultLedgerId: ledgerId } });
}

export async function getMe(userId: string) {
  const defaultLedgerId = await bootstrapUser(userId);

  const [user, ledgers] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, name: true, phoneNumber: true, createdAt: true },
    }),
    listMyLedgers(userId),
  ]);

  return {
    user: {
      id: user.id,
      name: user.name,
      phoneNumber: user.phoneNumber,
      createdAt: user.createdAt.toISOString(),
    },
    defaultLedgerId,
    ledgers: ledgers.map((ledger) => ({
      id: ledger.id,
      name: ledger.name,
      role: ledger.role,
      memberCount: ledger.memberCount,
      isDefault: ledger.id === defaultLedgerId,
    })),
  };
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/^\+86/, "");
  if (digits.length < 7) return "***";
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}
