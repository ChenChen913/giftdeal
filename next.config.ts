import path from "node:path";

import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * 内容安全策略。
 *
 * Next 会在 HTML 里注入内联的 bootstrap 脚本，没有 nonce 机制时只能放开
 * 'unsafe-inline'；开发模式（turbopack / react-refresh）还需要 'unsafe-eval'。
 * 这里的目标是兜住外链脚本、点击劫持、base 标签劫持，而不是做严格 CSP。
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/**
 * 构建目标判断。
 *
 * Cloudflare Workers 没有 node_modules，所有依赖都必须打进 worker bundle，
 * 所以 OpenNext 构建时不能保留 serverExternalPackages——否则 OpenNext 会在
 * .open-next 里重建 node_modules 软链，Windows 上直接 EPERM 失败。
 * 本地 `next dev` / `next start` 仍然保留 external，避免重复打包原生依赖。
 */
const isCloudflareBuild = process.env.BUILD_TARGET === "cloudflare";

/**
 * 数据库驱动的构建期切换。
 *
 * Node 运行时用 node-postgres（pg），本地 PGlite / Docker / Neon TCP 都能连；
 * Workers 没有 TCP，只能用 Neon 的 WebSocket 驱动。
 * 这里把服务层统一引用的 `@/server/db-drizzle` 在 Workers 构建时指向 db-neon.ts，
 * 业务代码不需要感知运行时差异。
 */
const dbAlias = {
  "@/server/db-drizzle": path.resolve(process.cwd(), "src/server/db-neon.ts"),
};

const nextConfig: NextConfig = {
  /**
   * dev 与 build 用不同的产物目录。
   *
   * 之前 `next dev` 和 `next build`（包括 Cloudflare 的 cf:build）共用 `.next`，
   * 同时跑时互相覆盖，Next 会反复「检测到配置变化」重启，重启清理文件又容易
   * 撞上工作区的安全删除阈值，导致 dev 进程直接退出。
   * 分开之后两者互不干扰。
   */
  distDir: process.env.NEXT_DIST_DIR ?? (isDev ? ".next-dev" : ".next"),

  /**
   * Next 16 默认用 Turbopack。只要配置里出现 `webpack` 而没有 `turbopack`，
   * dev 启动就会直接报错退出（"using Turbopack, with a webpack config and no turbopack config"）。
   * 这里保留空配置；Workers 构建额外挂上数据库别名。
   */
  turbopack: isCloudflareBuild ? { resolveAlias: dbAlias } : {},

  ...(isCloudflareBuild
    ? {
        // OpenNext 的打包阶段读 .next/standalone，必须让 Next 产出这个目录
        output: "standalone" as const,
      }
    : // pg 是原生依赖，交给 Node 运行时直接加载，避免重复打包
      { serverExternalPackages: ["pg"] }),

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },

  webpack: (config) => {
    // webpack 构建（老版本或显式 --webpack）时同样切到 Neon 驱动
    if (isCloudflareBuild) {
      config.resolve = config.resolve ?? {};
      config.resolve.alias = { ...config.resolve.alias, ...dbAlias };
    }
    return config;
  },
};

export default nextConfig;

// 让 `next dev` 能读到 wrangler 里定义的 bindings（Cloudflare 本地开发用）。
// 生产构建不受影响，OpenNext 的 CLI 会自行接管。
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
