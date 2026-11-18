import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import * as schema from "./schema";

/**
 * Neon Serverless（WebSocket）连接层。
 *
 * 只用于 Cloudflare Workers / 需要 WebSocket 代理的运行时：
 * - Workers 没有 TCP socket，`pg` 无法工作，必须走 Neon 的 WebSocket 驱动
 * - 构建 Cloudflare 版本时，next.config.ts 会把 `@/server/db-drizzle` 别名到本文件
 *
 * 普通 Node 部署（Vercel / 自建服务器 / 本地 PGlite）使用 db-pg.ts。
 *
 * 为什么用 WebSocket 而不是 HTTP 驱动：本项目有多处交互式事务
 * （结清关系、软删除联动等），HTTP 驱动只支持预定义 batch，无法在事务中读中间结果。
 */
/** 构建阶段用占位串，避免缺运行时连接串导致 next build 失败（不会真正连接） */
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
const connectionString =
  process.env.DATABASE_URL?.trim() ||
  (isBuildPhase ? "postgresql://build:build@127.0.0.1:1/build" : "");

if (!connectionString) {
  throw new Error("缺少环境变量 DATABASE_URL");
}

neonConfig.webSocketConstructor = WebSocket;

const pool = new Pool({ connectionString });

export const db = drizzle(pool, { schema });
