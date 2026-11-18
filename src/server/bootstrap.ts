import { and, eq, isNull } from "drizzle-orm";

import { DEFAULT_LEDGER_NAME } from "@/lib/constants";

import { db } from "@/server/db-drizzle";
import { isDevelopment } from "@/server/env";
import { ledger, membership, user } from "./schema";

/** 条件更新没抢到默认账本时抛出，让整个事务回滚（连刚插入的账本一起撤销） */
class LedgerClaimLost extends Error {}

/**
 * 本地演示账本，ID 与 `prisma/seed.ts` 里的固定值一致。
 * 只有「本地 development + 该账本确实已被 seed」两个条件同时成立时才启用。
 */
const DEMO_LEDGER_ID = "led_zhang";

/**
 * 本地演示同步：development 下新手机号登录直接复用 seed 演示账本，
 * 手机和电脑两个设备天然看到同一份数据，不再出现「一端满、一端空」。
 *
 * 门禁必须严格，不能放宽：
 * - APP_ENV=test：E2E / smoke 依赖「每个新会话独立空账本」，改了会成片失败；
 * - APP_ENV=production：真实用户数据必须严格隔离，绝不能共享演示账本。
 */
async function demoLedgerForNewUser(): Promise<string | null> {
  if (!isDevelopment) return null;
  const rows = await db
    .select({ id: ledger.id })
    .from(ledger)
    .where(eq(ledger.id, DEMO_LEDGER_ID))
    .limit(1);
  return rows[0]?.id ?? null;
}

/**
 * 保证用户一定有一个默认账本。
 * 幂等：已有 defaultLedgerId 直接返回。
 *
 * 顺序约束：`user.default_ledger_id` 外键引用 `ledger.id`，
 * 必须先插入账本再更新 user —— 反过来在任何 PostgreSQL 上都会触发外键违反
 * （`user_default_ledger_id_fkey`），进而让注册流程连带失败。
 * 复用演示账本时它本就存在，因此跳过建账本这一步，外键同样成立。
 *
 * 并发保护（单事务 + 条件更新 + 失败回滚）：
 * 1. 事务里先建账本与 OWNER 成员（演示模式改为给已存在的账本加 MEMBER）；
 * 2. 最后用 `update ... where default_ledger_id is null returning` 抢占；
 * 3. 抢不到就抛错回滚整个事务，账本与成员一起撤销 —— 不留无人引用的孤儿数据；
 * 4. 回到数据库读最终结果，以赢家的账本为准。
 */
export async function bootstrapUser(userId: string): Promise<string> {
  const existing = await db
    .select({ defaultLedgerId: user.defaultLedgerId })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (existing.length === 0) throw new Error(`用户不存在: ${userId}`);
  if (existing[0].defaultLedgerId) return existing[0].defaultLedgerId;

  const demoLedgerId = await demoLedgerForNewUser();
  const useDemoLedger = demoLedgerId !== null;
  const ledgerId = demoLedgerId ?? crypto.randomUUID();

  const claimed = await db
    .transaction(async (tx) => {
      if (!useDemoLedger) {
        await tx.insert(ledger).values({ id: ledgerId, name: DEFAULT_LEDGER_NAME });
      }
      await tx
        .insert(membership)
        .values({
          id: crypto.randomUUID(),
          ledgerId,
          userId,
          role: useDemoLedger ? "MEMBER" : "OWNER",
        })
        .onConflictDoNothing();
      const won = await tx
        .update(user)
        .set({ defaultLedgerId: ledgerId, updatedAt: new Date() })
        .where(and(eq(user.id, userId), isNull(user.defaultLedgerId)))
        .returning({ id: user.id });
      if (won.length === 0) throw new LedgerClaimLost();
      return true;
    })
    .catch((error: unknown) => {
      if (error instanceof LedgerClaimLost) return false;
      throw error;
    });

  // 并发下可能被别的请求抢先，以数据库里的值为准
  const after = await db
    .select({ defaultLedgerId: user.defaultLedgerId })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  const resolved = after[0]?.defaultLedgerId ?? (claimed ? ledgerId : null);
  if (!resolved) throw new Error(`默认账本初始化失败: ${userId}`);
  return resolved;
}
