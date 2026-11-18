import os from "node:os";
import path from "node:path";

import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Next 16 默认拦截跨源访问 dev 资源（/_next/* 的 JS chunk、HMR WebSocket），
 * 只放行 localhost。手机/其它设备用局域网 IP 打开时，这些请求会被 403，
 * 页面因为拿不到脚本一直停在 loading 转圈（HTML 与业务接口其实都是 200）。
 *
 * 这里在 dev 模式下把本机所有非回环 IPv4 加进白名单；next build / cf:build
 * 的 NODE_ENV=production，不会携带该配置，生产安全边界不受影响。
 * 额外来源（自定义域名、隧道）可用 NEXT_ALLOWED_DEV_ORIGINS 逗号分隔补充。
 *
 * 注意：Next 匹配的是纯 hostname，不能带协议或端口。
 */
function devAllowedOrigins(): string[] {
  const hosts = new Set<string>();
  try {
    for (const list of Object.values(os.networkInterfaces())) {
      for (const net of list ?? []) {
        if (net.family === "IPv4" && !net.internal && !net.address.startsWith("169.254.")) {
          hosts.add(net.address);
        }
      }
    }
  } catch {
    // 运行时不允许枚举网卡时，退回到显式配置
  }
  for (const host of (process.env.NEXT_ALLOWED_DEV_ORIGINS ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)) {
    hosts.add(host);
  }
  return [...hosts];
}

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
/**
 * 两种构建器要分别给路径：
 * - Turbopack 在 Windows 上无法解析 `D:\...` 这种盘符开头的绝对路径别名
 *   （会报 "windows imports are not implemented yet"，导致 cf:build 全部路由编译失败），
 *   所以给它项目根相对路径；
 * - webpack 由 Node 自己解析路径，绝对路径在 Windows 下工作正常，保持不变。
 */
const neonEntryRelative = "./src/server/db-neon.ts";
const neonEntryAbsolute = path.resolve(process.cwd(), "src/server/db-neon.ts");

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

  // 手机通过局域网 IP 访问 dev 时放行 /_next/* 资源，见 devAllowedOrigins()
  ...(isDev ? { allowedDevOrigins: devAllowedOrigins() } : {}),

  /**
   * Next 16 默认用 Turbopack。只要配置里出现 `webpack` 而没有 `turbopack`，
   * dev 启动就会直接报错退出（"using Turbopack, with a webpack config and no turbopack config"）。
   * 这里保留空配置；Workers 构建额外挂上数据库别名。
   */
  turbopack: isCloudflareBuild
    ? { resolveAlias: { "@/server/db-drizzle": neonEntryRelative } }
    : {},

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
      config.resolve.alias = {
        ...config.resolve.alias,
        "@/server/db-drizzle": neonEntryAbsolute,
      };
    }
    return config;
  },
};

export default nextConfig;

// 让 `next dev` 能读到 wrangler 里定义的 bindings（Cloudflare 本地开发用）。
// 生产构建不受影响，OpenNext 的 CLI 会自行接管。
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
