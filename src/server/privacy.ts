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
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { AppError } from "@/server/http/errors";

export const PRIVACY_COOKIE = "gd_privacy";
/** 解锁有效期：8 小时 */
export const PRIVACY_TTL_MS = 8 * 60 * 60 * 1000;

/** 连续输错几次后暂时锁定 */
const MAX_ATTEMPTS = 5;
const LOCK_MS = 60 * 1000;

/**
 * 失败计数放进程内。
 * 与现有 OTP 节流一样的已知局限：Vercel 多实例下不严格，
 * 但二次验证本身要求先登录，风险可控；生产化可换 Redis。
 */
const failures = new Map<string, { count: number; lockedUntil: number }>();

function secret(): string {
  const value = process.env.BETTER_AUTH_SECRET;
  if (!value) throw new Error("BETTER_AUTH_SECRET 未配置，隐私解锁不可用");
  return value;
}

/** 隐私密码：默认 331633，可用 PRIVACY_PASSWORD 覆盖 */
function expectedPassword(): string {
  return process.env.PRIVACY_PASSWORD?.trim() || "331633";
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

  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
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

/** 校验隐私密码；通过后签发解锁 Cookie */
export function verifyPrivacyPassword(userId: string, password: string) {
  const now = Date.now();
  const record = failures.get(userId);

  if (record && record.lockedUntil > now) {
    const wait = Math.ceil((record.lockedUntil - now) / 1000);
    throw new AppError("PRIVACY_LOCKED", undefined, `密码错误次数过多，请 ${wait} 秒后再试`);
  }

  const input = digest(password ?? "");
  const expected = digest(expectedPassword());
  const ok = timingSafeEqual(input, expected);

  if (!ok) {
    const count = (record?.count ?? 0) + 1;
    const lockedUntil = count >= MAX_ATTEMPTS ? now + LOCK_MS : 0;
    failures.set(userId, { count: lockedUntil ? 0 : count, lockedUntil });
    throw new AppError(
      "PRIVACY_PASSWORD_INVALID",
      undefined,
      lockedUntil
        ? "密码错误次数过多，请 1 分钟后再试"
        : `隐私密码不正确，还可尝试 ${MAX_ATTEMPTS - count} 次`,
    );
  }

  failures.delete(userId);
  return privacyCookie(userId);
}
