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
   * 这里给一个空对象，让 Turbopack 正常跑；webpack 那段只在需要时由构建显式指定。
   */
  turbopack: {},

  // Prisma 7 的 driver adapter 与 pg 都是原生依赖，交给 Node 运行时直接加载
  ...(isCloudflareBuild
    ? {
        // OpenNext 的打包阶段读 .next/standalone，必须让 Next 产出这个目录
        output: "standalone" as const,
      }
    : { serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"] }),

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

  /**
   * Prisma 7 的 workerd runtime 通过 `import("./x.wasm?module")` 加载查询编译器。
   * `?module` 是 wrangler/esbuild 的约定，Next 默认的 webpack 不认这个后缀，
   * 会报 "Module parse failed"。这里先让 webpack 把它当成 WebAssembly 模块处理，
   * 保证构建能通过；运行时的加载方式见 docs/cloudflare-deploy.md 的说明。
   */
  webpack: (config) => {
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    config.module.rules.push({
      test: /\.wasm$/,
      type: "webassembly/async",
    });
    return config;
  },
};

export default nextConfig;

// 让 `next dev` 能读到 wrangler 里定义的 bindings（Cloudflare 本地开发用）。
// 生产构建不受影响，OpenNext 的 CLI 会自行接管。
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
