import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import * as schema from "./schema";

/**
 * Drizzle 连接层。
 *
 * 用 Neon 的 WebSocket 驱动（`drizzle-orm/neon-serverless`）而不是 HTTP 驱动：
 * 本项目有 13 处交互式事务（结清关系、软删除联动等），HTTP 驱动只支持
 * 预定义的 batch、无法在事务中读取中间结果，改用 WebSocket 可以保留
 * `db.transaction(async (tx) => ...)` 的语义。
 *
 * Workers 有原生 WebSocket，直接赋给 neonConfig 即可，不需要 ws 包。
 */
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("缺少环境变量 DATABASE_URL");
}

neonConfig.webSocketConstructor = WebSocket;

const pool = new Pool({ connectionString });

export const db = drizzle(pool, { schema });

export type Db = typeof db;
export { schema };
