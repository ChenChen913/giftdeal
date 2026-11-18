import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

/**
 * Node 运行时的 Postgres 连接层（node-postgres）。
 *
 * 之前这里用的是 Neon 的 WebSocket 驱动，导致 `npm run dev:local` 实际上连不上
 * 本地 PGlite（PGlite 只暴露标准 Postgres 协议，没有 WebSocket 代理）。
 * 换成 pg 之后：
 * - 本地 PGlite / Docker Postgres / 自建 Postgres / Neon（TCP）都能直连
 * - 事务语义与生产一致，服务层测试才能跑在真实 SQL 上
 *
 * Cloudflare Workers 版本不使用本文件（见 db-neon.ts 与 next.config.ts 的别名）。
 */
/**
 * 构建阶段（next build）只做模块求值，不会真正连接数据库。
 * 构建机通常没有运行时 DATABASE_URL，这里用一个必然连不上的占位串，
 * 保证「缺少运行时密钥不会让构建失败」；生产启动时仍然严格要求真实连接串。
 */
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
const connectionString =
  process.env.DATABASE_URL?.trim() ||
  (isBuildPhase ? "postgresql://build:build@127.0.0.1:1/build" : "");

if (!connectionString) {
  throw new Error("缺少环境变量 DATABASE_URL");
}

/** 连接池全局单例：dev 热更新时避免每次重建连接 */
const globalForDb = globalThis as unknown as { giftdealPool?: Pool };

/**
 * 连接数默认 5。测试环境会设 DB_POOL_MAX=1：
 * PGlite 是单会话内核，多连接并发事务无法真正隔离，串行执行才能保证事务语义正确。
 */
const poolMax = Math.max(1, Number(process.env.DB_POOL_MAX ?? 5) || 5);

const pool =
  globalForDb.giftdealPool ??
  new Pool({
    connectionString,
    max: poolMax,
    // pg 默认 0（无限等待），必须显式设置，否则挂起时无法快速失败
    connectionTimeoutMillis: 10_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.giftdealPool = pool;
}

export const db = drizzle(pool, { schema });
