/**
 * 本地演示数据库（PGlite · Postgres 兼容，走标准 wire protocol）。
 *
 * 没有 Docker / Neon 时也能把项目跑起来：
 *   npm run db:local
 *
 * 数据落在 .localdb/ 目录，重启不丢；想清空就删掉这个目录。
 * 生产环境请用 Neon，见 README。
 */
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createServer } from "pglite-server";

const PORT = Number(process.env.PGLITE_PORT ?? 55432);
const DATA_DIR = process.env.PGLITE_DATA ?? ".localdb";

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new PGlite(DATA_DIR);
const server = createServer(db, { logLevel: 0 });

server.listen(PORT, "127.0.0.1", () => {
  console.log(
    `[local-db] 已就绪  postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres  (数据目录 ${DATA_DIR})`,
  );
});

const shutdown = async () => {
  server.close();
  await db.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
