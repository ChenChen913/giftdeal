import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma 7 的 driver adapter 与 pg 都是原生依赖，交给 Node 运行时直接加载
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
};

export default nextConfig;
