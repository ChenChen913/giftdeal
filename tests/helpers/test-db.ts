/**
 * 服务层测试用的临时数据库。
 *
 * 用 PGlite（WASM 版 Postgres）+ pglite-server 在随机端口起一个真实的
 * Postgres 协议服务，再把 DATABASE_URL 指过去。这样服务层跑的是真 SQL、
 * 真事务、真约束，不需要 Docker，也不会污染本地演示库。
 *
 * 注意：pglite-server 必须在 PGlite ready 之后才能接连接，否则客户端会挂住。
 * `PGlite.create()` 会等初始化完成，这里用它而不是 `new PGlite()`。
 */

import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:net";

import { PGlite } from "@electric-sql/pglite";
import { createServer } from "pglite-server";
import { Client } from "pg";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "prisma/migrations");

export type TestDatabase = {
  url: string;
  /** 清空所有业务表，保留结构 */
  reset: () => Promise<void>;
  close: () => Promise<void>;
};

async function applyMigrations(url: string): Promise<void> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const dirs = fs
      .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    for (const dir of dirs) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8");
      await client.query(sql);
    }
  } finally {
    await client.end();
  }
}

async function truncateAll(url: string): Promise<void> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const result = await client.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public'",
    );
    if (result.rows.length === 0) return;
    const tables = result.rows.map((row) => `"${row.tablename}"`).join(", ");
    await client.query(`truncate table ${tables} restart identity cascade`);
  } finally {
    await client.end();
  }
}

/**
 * 启动临时数据库并迁移。
 * 调用后 `process.env.DATABASE_URL` 已指向它，之后动态 import 的 db 模块才会拿到正确连接串。
 */
export async function startTestDatabase(): Promise<TestDatabase> {
  const pg = await PGlite.create();
  const server: Server = createServer(pg, { logLevel: 0 });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const { port } = server.address() as AddressInfo;
  const url = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;

  process.env.DATABASE_URL = url;
  process.env.APP_ENV = process.env.APP_ENV ?? "test";
  const env = process.env as Record<string, string | undefined>;
  env["NODE_ENV"] = env["NODE_ENV"] ?? "test";
  // 隐私 Cookie 的签名密钥；测试进程里不会用到真实密钥
  process.env.BETTER_AUTH_SECRET =
    process.env.BETTER_AUTH_SECRET ?? "test-only-secret-at-least-32-characters";
  /**
   * PGlite 是单会话内核：pglite-server 能用多个 TCP 连接接请求，但事务并不隔离
   * （一个连接的 rollback 会影响另一个连接的写入）。测试里把连接池锁成 1，
   * 让事务串行执行，语义与真实 Postgres 一致；并发用例仍然可以验证条件更新的防重逻辑。
   */
  process.env.DB_POOL_MAX = "1";

  await applyMigrations(url);

  return {
    url,
    reset: () => truncateAll(url),
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await pg.close();
    },
  };
}
