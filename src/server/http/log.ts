/**
 * 服务端错误日志脱敏。
 *
 * 为什么要单独一层：
 * - Drizzle 的 `DrizzleQueryError.message` 会把 SQL 和参数一起拼进去，
 *   参数里可能包含手机号、验证码、备注等隐私数据。
 * - 直接把 error 对象丢给 console.error 会把连接串、SQL 参数原样打进日志。
 *
 * 这里只保留「错误类型 + 错误码 + 脱敏后的摘要」，不打印完整对象；
 * 堆栈仍然保留（不含业务数据），方便定位问题。
 */

const MAX_MESSAGE_LENGTH = 400;

/** 对错误文本做脱敏：连接串、手机号、6 位数字（验证码）、SQL 参数段 */
export function redactErrorMessage(message: string): string {
  return message
    // postgres://user:pass@host/db → postgresql://[redacted]
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "postgresql://[redacted]")
    // 手机号（含 +86）与裸 11 位手机号
    .replace(/\+?86\d{11}\b/g, "[phone]")
    .replace(/\b1[3-9]\d{9}\b/g, "[phone]")
    // Drizzle 的 params: 段整体丢弃（可能含任何业务字段）
    .replace(/params:\s*[\s\S]*$/i, "params: [redacted]")
    // 6 位验证码（只脱敏独立的 6 位数字，避免误伤普通 ID）
    .replace(/\b\d{6}\b/g, "[code]")
    .slice(0, MAX_MESSAGE_LENGTH);
}

type ErrorLike = {
  name?: unknown;
  message?: unknown;
  code?: unknown;
  status?: unknown;
  statusCode?: unknown;
};

/**
 * 统一的服务端错误日志。
 * @param scope 例如 "api POST /api/v1/records"、"auth/otp"
 */
export function logServerError(scope: string, error: unknown): void {
  const candidate = (error ?? {}) as ErrorLike;
  const name = typeof candidate.name === "string" ? candidate.name : typeof error;
  const rawMessage = typeof candidate.message === "string" ? candidate.message : String(error);
  const code =
    typeof candidate.code === "string"
      ? candidate.code
      : typeof candidate.statusCode === "number"
        ? String(candidate.statusCode)
        : typeof candidate.status === "string"
          ? candidate.status
          : undefined;

  const suffix = code ? ` (${code})` : "";
  console.error(`[${scope}] ${name}${suffix}: ${redactErrorMessage(rawMessage)}`);

  // 堆栈只保留位置，不含业务参数；单独一行避免与摘要混淆
  if (error instanceof Error && error.stack) {
    const frames = error.stack.split("\n").slice(1, 6).join("\n");
    if (frames.trim()) console.error(frames);
  }
}
