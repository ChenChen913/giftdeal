/**
 * 数据库固定窗口限流。
 *
 * 之前隐私密码的失败计数放在进程内 Map，多实例部署时每个实例各算各的，
 * 攻击者并行打多个实例就能成倍放大尝试次数。这里改成一张 `throttle` 表：
 * 单条 UPSERT 完成「过期重置 + 计数 +1」，并发下由行锁保证原子性，不依赖 Redis。
 *
 * 之所以可以接受写数据库：这些键的写入频率极低（登录后的二次验证、短信重发），
 * 与业务读写不在一个量级，不会成为瓶颈。
 *
 * 隐私：
 * - 键里不直接放手机号，使用 HMAC-SHA256（服务端密钥）截断摘要；
 * - 清理只删除「超过保留期」的行，保留期远大于任何业务窗口，不会误删有效计数。
 */

import { createHmac } from "node:crypto";

import { eq, lt, sql } from "drizzle-orm";

import { db } from "@/server/db-drizzle";
import { throttle } from "./schema";

export type ThrottleState = {
  allowed: boolean;
  count: number;
  /** 距离窗口结束还有多少秒；allowed 为 true 时通常为 0 */
  retryAfterSeconds: number;
};

/** 过期记录保留期：远大于所有业务窗口（最长 60 秒），避免误删有效计数 */
export const THROTTLE_RETENTION_MS = 24 * 60 * 60 * 1000;

/** 触发清理的概率：低频率、无感，不引入定时任务 */
const CLEANUP_PROBABILITY = 0.02;

type ThrottleRow = { count: number; windowStart: Date };

function toState(row: ThrottleRow | undefined, limit: number, windowSeconds: number): ThrottleState {
  if (!row) return { allowed: true, count: 0, retryAfterSeconds: 0 };

  const windowEnd = row.windowStart.getTime() + windowSeconds * 1000;
  const remainMs = windowEnd - Date.now();
  if (remainMs <= 0) return { allowed: true, count: 0, retryAfterSeconds: 0 };

  return {
    // limit = 窗口内允许的次数：第 limit 次仍然允许，第 limit+1 次才拒绝
    allowed: row.count <= limit,
    count: row.count,
    // count >= limit 时给出剩余秒数（allowed 为 true 的边界情况下调用方可忽略）
    retryAfterSeconds: row.count >= limit ? Math.max(1, Math.ceil(remainMs / 1000)) : 0,
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

  // 顺手清理过期记录：概率触发、失败静默，不影响当前请求
  if (Math.random() < CLEANUP_PROBABILITY) {
    void cleanupExpiredThrottle().catch(() => undefined);
  }

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

/**
 * 删除超过保留期的记录。
 * - 只删 window_start 早于「now - 24h」的行，任何仍在窗口内的计数都不会被删除；
 * - 由 consumeThrottle 低概率触发，也可以被测试/运维脚本直接调用；
 * - 失败由调用方决定是否忽略（业务路径里忽略并继续）。
 */
export async function cleanupExpiredThrottle(now = Date.now()): Promise<number> {
  const cutoff = new Date(now - THROTTLE_RETENTION_MS);
  const removed = await db
    .delete(throttle)
    .where(lt(throttle.windowStart, cutoff))
    .returning({ key: throttle.key });
  return removed.length;
}

function digest(value: string): string {
  // 限流键不是密码学凭据，但也不应该把手机号明文写进表里。
  // 使用服务端密钥做 HMAC，避免只靠手机号空间被彩虹表反查。
  const key = process.env.BETTER_AUTH_SECRET?.trim() || "giftdeal-throttle-local";
  return createHmac("sha256", key).update(value, "utf8").digest("base64url").slice(0, 32);
}

export const throttleKeys = {
  privacyFail: (userId: string) => `privacy-fail:${userId}`,
  /** 手机号 → 稳定摘要，不在数据库里保存完整号码 */
  otpSend: (phone: string) => `otp-send:${digest(phone)}`,
};
