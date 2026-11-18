#!/usr/bin/env node
/**
 * 限流表清理（运维入口）。
 *
 * 业务路径上已经有一次「低概率顺手清理」（consumeThrottle 里 2% 触发），
 * 但低流量环境可能很久才触发一次。可以用这个脚本定期跑（cron / 手动），
 * 也可以直接写进部署平台的定时任务。
 *
 * 删除范围（都很保守，不会碰仍在生效的计数）：
 * - throttle.window_start 早于 24 小时前（最长业务窗口只有 60 秒）；
 * - rate_limit.last_request 早于 1 小时前（Better Auth 最长窗口 60 秒）。
 *
 * 用法：
 *   npm run db:cleanup            # 真正删除
 *   npm run db:cleanup -- --dry-run   # 只统计不删除
 */
import "dotenv/config";

import pg from "pg";

const THROTTLE_RETENTION_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT_RETENTION_MS = 60 * 60 * 1000;

const dryRun = process.argv.includes("--dry-run");
const connectionString = process.env.DATABASE_URL?.trim();

if (!connectionString) {
  console.error("[cleanup] 缺少 DATABASE_URL，无法连接数据库");
  process.exit(1);
}

const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10_000 });

try {
  await client.connect();

  const throttleCutoff = new Date(Date.now() - THROTTLE_RETENTION_MS);
  const rateLimitCutoff = Date.now() - RATE_LIMIT_RETENTION_MS;

  const throttleRows = await client.query(
    "select count(*)::int as n from throttle where window_start < $1",
    [throttleCutoff],
  );
  const rateLimitRows = await client.query(
    "select count(*)::int as n from rate_limit where last_request < $1",
    [rateLimitCutoff],
  );

  const throttleCount = Number(throttleRows.rows[0]?.n ?? 0);
  const rateLimitCount = Number(rateLimitRows.rows[0]?.n ?? 0);

  if (dryRun) {
    console.log(
      `[cleanup] dry-run：throttle 可清理 ${throttleCount} 行，rate_limit 可清理 ${rateLimitCount} 行`,
    );
  } else {
    const deletedThrottle = await client.query(
      "delete from throttle where window_start < $1 returning key",
      [throttleCutoff],
    );
    const deletedRateLimit = await client.query(
      "delete from rate_limit where last_request < $1 returning key",
      [rateLimitCutoff],
    );
    console.log(
      `[cleanup] 已删除 throttle ${deletedThrottle.rowCount} 行、rate_limit ${deletedRateLimit.rowCount} 行`,
    );
  }
} catch (error) {
  // 只打印错误摘要，并把可能出现的连接串脱敏（不把账号密码带进日志）
  const message = error instanceof Error ? error.message : String(error);
  console.error("[cleanup] 执行失败：", message.replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://[redacted]"));
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
