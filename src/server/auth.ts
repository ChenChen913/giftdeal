import * as nodeOs from "node:os";

import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { phoneNumber } from "better-auth/plugins";

import { LIMITS } from "@/lib/constants";

import { bootstrapUser } from "./bootstrap";
import { db } from "@/server/db-drizzle";
import { fixedCodeForEnvironment, getOtpProvider, maskPhoneForLog } from "./otp";
import {
  devOnlyFlag,
  ipAddressHeaders,
  rateLimitEnabled,
  trustedProxyCidrs,
} from "./env";
import { logServerError } from "./http/log";
import { account, rateLimit, session, user, verification } from "./schema";
import { consumeThrottle, throttleKeys } from "./throttle";

/**
 * 本地演示用：手机通过局域网 IP 访问时，Origin 不是 localhost，
 * 需要把这些内网地址加进 trustedOrigins，否则登录会被判 Invalid origin。
 * 仅在 ALLOW_LAN_ACCESS=true 且非生产环境时启用；生产环境有真实域名，不需要开。
 *
 * 注意：Cloudflare Workers（workerd）的 node:os 不提供网卡枚举。
 * 这里用命名空间导入而非命名导入——缺失的命名导出会让模块加载直接抛错，
 * 而命名空间属性只会在访问时为 undefined，可以安全兜底。
 */
function lanOrigins(): string[] {
  if (!devOnlyFlag("ALLOW_LAN_ACCESS")) return [];
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

/** 生产环境同一手机号的短信重发冷却；开发/测试不限制，方便反复联调 */
class OtpTooFrequentError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(`验证码发送过于频繁，请 ${retryAfterSeconds} 秒后再试`);
    this.name = "OtpTooFrequentError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

async function sendOtpOrThrow(phone: string, code: string): Promise<void> {
  try {
    // 生产环境始终开启；测试可通过 RATE_LIMIT_ENABLED=true 打开（只会更严格）
    if (rateLimitEnabled()) {
      const gate = await consumeThrottle(
        throttleKeys.otpSend(phone),
        1,
        LIMITS.otpThrottleSeconds,
      );
      if (!gate.allowed) throw new OtpTooFrequentError(gate.retryAfterSeconds);
    }

    await getOtpProvider().send(phone, code);
  } catch (error) {
    // 日志只保留打码后的号码，绝不打印验证码；错误摘要统一走脱敏
    logServerError(`auth/otp ${maskPhoneForLog(phone)}`, error);

    if (error instanceof OtpTooFrequentError) {
      throw new APIError("TOO_MANY_REQUESTS", { message: error.message });
    }
    // 发送失败必须让调用方失败：不能返回「已发送」但用户永远收不到
    throw new APIError("INTERNAL_SERVER_ERROR", { message: "验证码发送失败，请稍后重试" });
  }
}

const fixedCode = fixedCodeForEnvironment();

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
    schema: { user, session, account, verification, rateLimit },
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
   * 限流：
   * - 生产环境始终开启；测试/开发默认关闭（CI/E2E 需要连续登录），
   *   但可用 RATE_LIMIT_ENABLED=true 打开做真实数据库限流测试。
   * - 存储放数据库（rate_limit 表），多实例共享同一份计数；单条 UPSERT/乐观锁保证原子性。
   * - 覆盖发送验证码与验证验证码两个入口。
   * - 手机号级 60 秒冷却仍是独立的一层，不依赖 IP，无法通过伪造 IP 绕过。
   */
  rateLimit: {
    enabled: rateLimitEnabled(),
    storage: "database",
    modelName: "rateLimit",
    window: 60,
    max: 60,
    customRules: {
      "/phone-number/send-otp": { window: 60, max: 5 },
      "/phone-number/verify": { window: 60, max: 10 },
    },
  },
  /**
   * 内部账号（admin）走 credential 通道，但前端不出现密码框：
   * 由 /api/v1/auth/admin-login 在服务端换取会话，只接受字面量 "admin"。
   * 生产环境永远关闭（devOnlyFlag），即使误配 ALLOW_ADMIN_LOGIN 也不生效。
   */
  emailAndPassword: {
    enabled: devOnlyFlag("ALLOW_ADMIN_LOGIN"),
    minPasswordLength: 6,
  },
  plugins: [
    phoneNumber({
      otpLength: 6,
      expiresIn: 300,
      allowedAttempts: 3,
      // 发送失败必须上抛：Better Auth 会 await 这个 Promise，失败时接口返回错误，
      // 前端不会再出现「提示已发送但收不到短信」。
      sendOTP: ({ phoneNumber: phone, code }) => sendOtpOrThrow(phone, code),
      // 开发/测试环境固定验证码；生产环境 fixedCode 恒为 null，走真实随机码
      ...(fixedCode
        ? {
            verifyOTP: ({ code }: { phoneNumber: string; code: string }) => code === fixedCode,
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
            logServerError("auth/bootstrap", error);
          }
        },
      },
    },
  },
  advanced: {
    database: { joins: true },
    /**
     * IP 信任边界：
     * - 默认先读 x-real-ip（Vercel 等平台会覆盖），再读 x-forwarded-for；
     * - 多级 XFF 只有在 TRUSTED_PROXY_CIDRS 配置了可信代理时才解析，
     *   否则 Better Auth 会退化为「no-trusted-ip」共享桶，避免伪造单个 IP 横向绕过；
     * - 手机号级冷却与全局发送上限不依赖 IP。
     */
    ipAddress: {
      ipAddressHeaders: ipAddressHeaders(),
      ...(trustedProxyCidrs().length > 0 ? { trustedProxies: trustedProxyCidrs() } : {}),
    },
  },
});

export type Auth = typeof auth;
