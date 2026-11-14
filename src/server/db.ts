import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("缺少环境变量 DATABASE_URL");
}

const adapter = new PrismaPg({
  connectionString,
  // Neon pooled 已经做了连接复用，serverless 实例里不宜开太大
  max: 5,
  // pg 默认 0（无限等待），必须显式设置，否则挂起时无法快速失败
  connectionTimeoutMillis: 10_000,
});

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
