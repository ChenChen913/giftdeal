/**
 * 数据库固定窗口限流。
 *
 * 之前隐私密码的失败计数放在进程内 Map，多实例部署时每个实例各算各的，
 * 攻击者并行打多个实例就能成倍放大尝试次数。这里改成一张 `throttle` 表：
 * 单条 UPSERT 完成「过期重置 + 计数 +1」，并发下由行锁保证原子性，不依赖 Redis。
 *
 * 之所以可以接受写数据库：这些键的写入频率极低（登录后的二次验证、短信重发），
 * 与业务读写不在一个量级，不会成为瓶颈。
 */

import { eq, sql } from "drizzle-orm";

import { db } from "@/server/db-drizzle";
import { throttle } from "./schema";

export type ThrottleState = {
  allowed: boolean;
  count: number;
  /** 距离窗口结束还有多少秒；allowed 为 true 时通常为 0 */
  retryAfterSeconds: number;
};

type ThrottleRow = { count: number; windowStart: Date };

function toState(row: ThrottleRow | undefined, limit: number, windowSeconds: number): ThrottleState {
  if (!row) return { allowed: true, count: 0, retryAfterSeconds: 0 };

  const windowEnd = row.windowStart.getTime() + windowSeconds * 1000;
  const remainMs = windowEnd - Date.now();
  if (remainMs <= 0) return { allowed: true, count: 0, retryAfterSeconds: 0 };

  return {
    allowed: row.count < limit,
    count: row.count,
    retryAfterSeconds: row.count < limit ? 0 : Math.max(1, Math.ceil(remainMs / 1000)),
  };
}

/**
 * 记一次操作并返回计数结果。
 * 超过 limit 时 allowed=false，调用方据此拒绝请求。
 */
export async function consumeThrottle(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<ThrottleState> {
  const expired = sql`${throttle.windowStart} <= now() - (${windowSeconds}::int * interval '1 second')`;

  const rows = await db
    .insert(throttle)
    .values({ key, count: 1 })
    .onConflictDoUpdate({
      target: throttle.key,
      set: {
        // 窗口已过期 → 从 1 重新计数；否则在原值上 +1
        count: sql`CASE WHEN ${expired} THEN 1 ELSE ${throttle.count} + 1 END`,
        windowStart: sql`CASE WHEN ${expired} THEN now() ELSE ${throttle.windowStart} END`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ count: throttle.count, windowStart: throttle.windowStart });

  return toState(rows[0], limit, windowSeconds);
}

/** 只读查询：不消耗次数，用于「是否已被锁定」的前置判断 */
export async function readThrottle(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<ThrottleState> {
  const rows = await db
    .select({ count: throttle.count, windowStart: throttle.windowStart })
    .from(throttle)
    .where(eq(throttle.key, key))
    .limit(1);

  return toState(rows[0], limit, windowSeconds);
}

/** 成功后清空计数（例如密码验证通过） */
export async function clearThrottle(key: string): Promise<void> {
  await db.delete(throttle).where(eq(throttle.key, key));
}

export const throttleKeys = {
  privacyFail: (userId: string) => `privacy-fail:${userId}`,
  otpSend: (phone: string) => `otp-send:${phone}`,
};
