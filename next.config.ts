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

const nextConfig: NextConfig = {
  // Prisma 7 的 driver adapter 与 pg 都是原生依赖，交给 Node 运行时直接加载
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],

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
};

export default nextConfig;
