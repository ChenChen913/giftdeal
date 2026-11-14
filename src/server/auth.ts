import * as nodeOs from "node:os";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { phoneNumber } from "better-auth/plugins";

import { bootstrapUser } from "./bootstrap";
import { db } from "./db-drizzle";
import { isMockOtpEnabled, mockOtpCode, otpProvider } from "./otp";
import { account, session, user, verification } from "./schema";

/**
 * 本地演示用：手机通过局域网 IP 访问时，Origin 不是 localhost，
 * 需要把这些内网地址加进 trustedOrigins，否则登录会被判 Invalid origin。
 * 仅在 ALLOW_LAN_ACCESS=true 时启用；生产环境有真实域名，不需要开。
 *
 * 注意：Cloudflare Workers（workerd）的 node:os 不提供网卡枚举。
 * 这里用命名空间导入而非命名导入——缺失的命名导出会让模块加载直接抛错，
 * 而命名空间属性只会在访问时为 undefined，可以安全兜底。
 */
function lanOrigins(): string[] {
  if (process.env.ALLOW_LAN_ACCESS !== "true") return [];
  if (typeof nodeOs.networkInterfaces !== "function") return [];
  const port = process.env.PORT ?? "3000";
  const origins: string[] = [];
  try {
    for (const list of Object.values(nodeOs.networkInterfaces())) {
      for (const net of list ?? []) {
        // 跳过回环与 169.254 链路本地地址，其余内网 IPv4 都放行
        if (net.family === "IPv4" && !net.internal && !net.address.startsWith("169.254.")) {
          origins.push(`http://${net.address}:${port}`);
        }
      }
    }
  } catch {
    // 运行时禁止网卡枚举时忽略，不影响登录
  }
  return origins;
}

/**
 * Better Auth 配置。
 *
 * 认证方式：手机号 + 短信验证码（phoneNumber 插件）
 * - 首次验证通过即注册（signUpOnVerification），email 用占位值满足默认模型约束
 * - 建号后由 databaseHooks 建默认账本（失败不影响登录，/me 会兜底重试）
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  /**
   * 本地用 localhost 或 127.0.0.1 打开都算同源，避免因为 host 写法不同被判 Invalid origin。
   * 生产环境只会有真实域名，这两条不会生效。
   */
  trustedOrigins: [
    ...(process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : []),
    ...(process.env.NEXT_PUBLIC_APP_URL ? [process.env.NEXT_PUBLIC_APP_URL] : []),
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    ...lanOrigins(),
  ],
  /**
   * 内部账号（admin）走 credential 通道，但前端不出现密码框：
   * 由 /api/v1/auth/admin-login 在服务端换取会话，只接受字面量 "admin"。
   * 生产环境把 ALLOW_ADMIN_LOGIN 设为 false 即整体关闭。
   */
  emailAndPassword: {
    enabled: process.env.ALLOW_ADMIN_LOGIN === "true",
    minPasswordLength: 6,
  },
  plugins: [
    phoneNumber({
      otpLength: 6,
      expiresIn: 300,
      allowedAttempts: 3,
      // 官方建议不要 await：发送失败只记日志，不阻塞登录请求。
      // 但必须 catch，否则真实通道报错会变成 unhandled rejection。
      sendOTP: ({ phoneNumber: phone, code }) => {
        otpProvider.send(phone, code).catch((error) => {
          const masked = phone.replace(/^\+86(\d{3})\d{4}(\d{4})$/, "$1****$2");
          console.error(`[OTP] 发送失败 ${masked}`, error);
        });
      },
      // 开发环境固定验证码，便于前端联调与自动化冒烟
      ...(isMockOtpEnabled
        ? {
            verifyOTP: ({ code }: { phoneNumber: string; code: string }) =>
              code === mockOtpCode,
          }
        : {}),
      signUpOnVerification: {
        getTempEmail: (phone: string) => `${phone.replace(/\D/g, "")}@phone.local`,
        getTempName: (phone: string) => `用户${phone.slice(-4)}`,
      },
      phoneNumberValidator: (phone: string) => /^\+86\d{11}$/.test(phone),
    }),
  ],
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          try {
            await bootstrapUser(user.id);
          } catch (error) {
            // 建默认账本失败不应该阻断注册，/api/v1/me 会再兜一次
            console.error("[auth] 初始化默认账本失败", error);
          }
        },
      },
    },
  },
  advanced: {
    database: { joins: true },
  },
});

export type Auth = typeof auth;
