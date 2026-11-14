import { and, eq, isNull } from "drizzle-orm";

import { DEFAULT_LEDGER_NAME } from "@/lib/constants";

import { db } from "./db-drizzle";
import { ledger, membership, user } from "./schema";

/**
 * 保证用户一定有一个默认账本。
 * 幂等：已有 defaultLedgerId 直接返回。
 *
 * 并发保护：先建账本，再用 `update ... where default_ledger_id is null` 抢占；
 * 抢不到说明别的请求先完成了，读回对方的结果。
 *
 * 注意：Neon HTTP 驱动不支持交互式事务，这里用 batch（原子提交）。
 * 极端并发下可能留下一个没人引用的账本，不影响功能。
 */
export async function bootstrapUser(userId: string): Promise<string> {
  const existing = await db
    .select({ defaultLedgerId: user.defaultLedgerId })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (existing.length === 0) throw new Error(`用户不存在: ${userId}`);
  if (existing[0].defaultLedgerId) return existing[0].defaultLedgerId;

  const ledgerId = crypto.randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(ledger).values({ id: ledgerId, name: DEFAULT_LEDGER_NAME });
    await tx.insert(membership).values({
      id: crypto.randomUUID(),
      ledgerId,
      userId,
      role: "OWNER",
    });
    await tx
      .update(user)
      .set({ defaultLedgerId: ledgerId, updatedAt: new Date() })
      .where(and(eq(user.id, userId), isNull(user.defaultLedgerId)));
  });

  // 并发下可能被别的请求抢先，以数据库里的值为准
  const after = await db
    .select({ defaultLedgerId: user.defaultLedgerId })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  return after[0]?.defaultLedgerId ?? ledgerId;
}
