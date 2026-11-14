import { and, count, eq } from "drizzle-orm";

import type { MembershipRole } from "@/lib/constants";

import { db } from "@/server/db-drizzle";
import { AppError } from "@/server/http/errors";
import { ledger, membership } from "@/server/schema";
import { requireSession } from "./session";

export type LedgerContext = {
  userId: string;
  ledgerId: string;
  role: MembershipRole;
};

/**
 * 数据隔离的第一道防线：所有账本内接口必须先过这里。
 *
 * 1. 必须有会话（否则 401）
 * 2. 必须带账本上下文（X-Ledger-Id 优先，其次 ?ledgerId=，否则 400）
 * 3. 必须是该账本成员（不是成员：账本存在 → 403，账本不存在 → 404）
 */
export async function requireLedgerContext(req: Request): Promise<LedgerContext> {
  const { userId } = await requireSession(req);

  const url = new URL(req.url);
  const ledgerId =
    req.headers.get("x-ledger-id")?.trim() || url.searchParams.get("ledgerId")?.trim() || "";

  if (!ledgerId) throw new AppError("LEDGER_REQUIRED");

  return assertMembership(userId, ledgerId);
}

/** 路径里已经带了 ledgerId 的接口（/ledgers/{id}）用它，避免和请求头打架 */
export async function requireLedgerById(
  req: Request,
  ledgerId: string,
): Promise<LedgerContext> {
  const { userId } = await requireSession(req);
  if (!ledgerId?.trim()) throw new AppError("LEDGER_REQUIRED");
  return assertMembership(userId, ledgerId.trim());
}

async function assertMembership(userId: string, ledgerId: string): Promise<LedgerContext> {
  const rows = await db
    .select({ role: membership.role })
    .from(membership)
    .where(and(eq(membership.ledgerId, ledgerId), eq(membership.userId, userId)))
    .limit(1);

  if (rows.length > 0) {
    return { userId, ledgerId, role: rows[0].role as MembershipRole };
  }

  const ledgerRows = await db
    .select({ n: count() })
    .from(ledger)
    .where(eq(ledger.id, ledgerId));

  throw Number(ledgerRows[0]?.n ?? 0) > 0
    ? new AppError("LEDGER_FORBIDDEN")
    : new AppError("LEDGER_NOT_FOUND");
}

export function requireOwner(ctx: LedgerContext): void {
  if (ctx.role !== "OWNER") throw new AppError("FORBIDDEN");
}
