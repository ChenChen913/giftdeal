/**
 * 隐私解锁（二次验证）。
 *
 * 界面默认把金额与人名做遮罩处理；用户输入**隐私密码**后才能看到真实值。
 * 解锁状态由服务端签发的 httpOnly Cookie 决定，前端无法自行伪造：
 * - Cookie 值 = base64url(userId.exp).hmac(secret)
 * - 每次读取都会校验签名、有效期、以及是否与当前会话 userId 一致
 * - 换账号、换设备、Cookie 过期都会自动回到遮罩状态
 *
 * 密码只存在服务端环境变量里（PRIVACY_PASSWORD），不会进入前端打包产物。
 *
 * 生产环境约束（见 server/env.ts）：
 * - 必须显式配置 PRIVACY_PASSWORD，且至少 8 位、非重复/连续/常见弱口令
 * - 未配置或不达标 → 接口直接 503，不会回退到默认密码
 *
 * 失败锁定：
 * - 计数落 `throttle` 表（不是进程内 Map），多实例部署下同样有效
 * - 5 次错误锁定 60 秒；验证通过后清零
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { ConfigError, isProduction, privacyPassword } from "./env";
import { AppError } from "./http/errors";
import { clearThrottle, consumeThrottle, readThrottle, throttleKeys } from "./throttle";

export const PRIVACY_COOKIE = "gd_privacy";
/** 解锁有效期：8 小时 */
export const PRIVACY_TTL_MS = 8 * 60 * 60 * 1000;

/** 连续输错几次后暂时锁定 */
export const PRIVACY_MAX_ATTEMPTS = 5;
export const PRIVACY_LOCK_SECONDS = 60;

function secret(): string {
  const value = process.env.BETTER_AUTH_SECRET;
  if (!value) throw new ConfigError("BETTER_AUTH_SECRET", "BETTER_AUTH_SECRET 未配置，隐私解锁不可用");
  return value;
}

/** 先哈希再比较：既避免明文比较，也不泄露密码长度 */
function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function tokenFor(userId: string, expiresAt: number): string {
  const payload = Buffer.from(`${userId}.${expiresAt}`).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function parseToken(token: string | undefined, userId: string): number | null {
  if (!token) return null;
  const [payload, signature, ...rest] = token.split(".");
  if (!payload || !signature || rest.length > 0) return null;

  let expected: Buffer;
  let actual: Buffer;
  try {
    expected = Buffer.from(sign(payload));
    actual = Buffer.from(signature);
  } catch {
    // 签名密钥未配置时，按「未解锁」处理，不把配置错误暴露成 500
    return null;
  }
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  let decoded: string;
  try {
    decoded = Buffer.from(payload, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const dot = decoded.lastIndexOf(".");
  if (dot <= 0) return null;
  const tokenUserId = decoded.slice(0, dot);
  const expiresAt = Number(decoded.slice(dot + 1));
  if (tokenUserId !== userId || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  return expiresAt;
}

function readCookie(req: Request): string | undefined {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === PRIVACY_COOKIE) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return undefined;
}

export function privacyStatus(req: Request, userId: string) {
  const expiresAt = parseToken(readCookie(req), userId);
  return {
    unlocked: expiresAt !== null,
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
  };
}

export function privacyCookie(userId: string): {
  value: string;
  maxAge: number;
  expiresAt: string;
} {
  const expiresAt = Date.now() + PRIVACY_TTL_MS;
  return {
    value: tokenFor(userId, expiresAt),
    maxAge: PRIVACY_TTL_MS / 1000,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

/**
 * 校验隐私密码；通过后签发解锁 Cookie。
 *
 * 顺序：先查锁定 → 再比对密码 → 失败计数 / 成功清零。
 * 计数在数据库里，多个实例共享同一个 lockedUntil。
 */
export async function verifyPrivacyPassword(userId: string, password: string) {
  let expectedPassword: string;
  try {
    expectedPassword = privacyPassword();
  } catch (error) {
    if (error instanceof ConfigError) {
      throw new AppError("PRIVACY_UNAVAILABLE", undefined, error.message);
    }
    throw error;
  }

  const key = throttleKeys.privacyFail(userId);
  const state = await readThrottle(key, PRIVACY_MAX_ATTEMPTS, PRIVACY_LOCK_SECONDS);

  if (!state.allowed) {
    throw new AppError(
      "PRIVACY_LOCKED",
      undefined,
      `密码错误次数过多，请 ${state.retryAfterSeconds} 秒后再试`,
    );
  }

  const input = digest(password ?? "");
  const expected = digest(expectedPassword);
  const ok = timingSafeEqual(input, expected);

  if (!ok) {
    const next = await consumeThrottle(key, PRIVACY_MAX_ATTEMPTS, PRIVACY_LOCK_SECONDS);
    if (!next.allowed) {
      throw new AppError(
        "PRIVACY_LOCKED",
        undefined,
        `密码错误次数过多，请 ${next.retryAfterSeconds} 秒后再试`,
      );
    }
    const left = Math.max(0, PRIVACY_MAX_ATTEMPTS - next.count);
    throw new AppError("PRIVACY_PASSWORD_INVALID", undefined, `隐私密码不正确，还可尝试 ${left} 次`);
  }

  await clearThrottle(key);
  return privacyCookie(userId);
}

/**
 * 生产环境自检用：确认隐私验证真的可用。
 * 开发环境永远通过（有默认密码）。
 */
export function privacyConfigProblem(): string | null {
  if (!isProduction) return null;
  try {
    privacyPassword();
    secret();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "隐私验证配置不合法";
  }
}
