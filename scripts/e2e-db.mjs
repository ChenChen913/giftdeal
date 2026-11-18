/**
 * E2E 专用数据库：每次运行都从空库开始。
 *
 * - 独立数据目录 `.localdb-e2e`，不碰本地演示库 `.localdb`
 * - 先 await PGlite.create（等内核初始化完）再监听端口，否则前几秒的连接会挂住
 */
import fs from "node:fs";

import { PGlite } from "@electric-sql/pglite";
import { createServer } from "pglite-server";

const DATA_DIR = process.env.E2E_DB_DATA ?? ".localdb-e2e";
const PORT = Number(process.env.E2E_DB_PORT ?? 55440);

fs.rmSync(DATA_DIR, { recursive: true, force: true });

const db = await PGlite.create(DATA_DIR);
const server = createServer(db, { logLevel: 0 });

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(PORT, "127.0.0.1", resolve);
});

console.log(`[e2e-db] ready postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`);

const shutdown = async () => {
  server.close();
  await db.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
