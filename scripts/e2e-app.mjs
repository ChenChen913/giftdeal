/**
 * E2E 应用进程：等数据库就绪 → 跑迁移 → 起 `next start`。
 *
 * 环境刻意用 APP_ENV=test：
 * - 必须配合 `npm run build:test`（NEXT_PUBLIC_E2E_BUILD=1）生成的产物；
 *   严格生产构建在 APP_ENV=test 下会拒绝启动，这是有意的安全边界
 * - 允许 mock 短信 + 固定验证码，不需要真实短信、不污染本地演示库
 *
 * 迁移直接执行 prisma/migrations 下的 SQL，不依赖 Prisma CLI 的交互输出。
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { Client } from "pg";

const PORT = Number(process.env.E2E_APP_PORT ?? 3100);
const DB_PORT = Number(process.env.E2E_DB_PORT ?? 55440);
const DB_URL = `postgresql://postgres:postgres@127.0.0.1:${DB_PORT}/postgres`;
const MIGRATIONS_DIR = path.resolve(process.cwd(), "prisma/migrations");

const env = {
  ...process.env,
  APP_ENV: "test",
  NODE_ENV: "production",
  DATABASE_URL: DB_URL,
  DIRECT_URL: DB_URL,
  BETTER_AUTH_SECRET: "e2e-only-secret-at-least-32-characters-long",
  BETTER_AUTH_URL: `http://127.0.0.1:${PORT}`,
  NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${PORT}`,
  SMS_PROVIDER: "mock",
  OTP_ALLOW_FIXED_CODE: "true",
  OTP_MOCK_CODE: "123456",
  PRIVACY_PASSWORD: "331633",
  ALLOW_ADMIN_LOGIN: "false",
  ALLOW_LAN_ACCESS: "false",
};

async function waitForDb(timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const client = new Client({ connectionString: DB_URL, connectionTimeoutMillis: 2000 });
    try {
      await client.connect();
      await client.end();
      return;
    } catch {
      await client.end().catch(() => {});
      if (Date.now() > deadline) throw new Error("等待 E2E 数据库超时");
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

async function migrate() {
  const client = new Client({ connectionString: DB_URL });
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
  console.log(`[e2e-app] 迁移完成（${DB_URL}）`);
}

await waitForDb();
await migrate();

const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextBin, "start", "-p", String(PORT)], {
  stdio: "inherit",
  env,
});

const shutdown = (signal) => {
  if (!child.killed) child.kill(signal);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
child.on("exit", (code) => process.exit(code ?? 0));
