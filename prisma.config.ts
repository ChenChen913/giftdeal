import "dotenv/config";
import { defineConfig, env } from "prisma/config";

/**
 * Prisma 7 的 CLI 配置。
 * 迁移 / seed 走 DIRECT_URL（Neon 直连串），运行时走 DATABASE_URL（pooled 串）。
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DIRECT_URL"),
  },
});
