/** 统一错误类型与错误码 → HTTP 状态映射 */

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "LEDGER_REQUIRED"
  | "LEDGER_FORBIDDEN"
  | "LEDGER_NOT_FOUND"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONTACT_NAME_DUPLICATE"
  | "RECORD_NOT_SETTLEABLE"
  | "RECORD_ALREADY_SETTLED"
  | "RECORD_NOT_SETTLED"
  | "SETTLE_TARGET_INVALID"
  | "RECORD_IMMUTABLE_FIELD"
  | "INVITE_NOT_FOUND"
  | "INVITE_EXPIRED"
  | "INVITE_USED"
  | "INVITE_REVOKED"
  | "FORBIDDEN"
  | "RATE_LIMITED"
  | "PRIVACY_PASSWORD_INVALID"
  | "PRIVACY_LOCKED"
  | "PRIVACY_UNAVAILABLE"
  | "CONFLICT"
  | "INTERNAL_ERROR";

export const ERROR_STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  LEDGER_REQUIRED: 400,
  LEDGER_FORBIDDEN: 403,
  LEDGER_NOT_FOUND: 404,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 422,
  CONTACT_NAME_DUPLICATE: 409,
  RECORD_NOT_SETTLEABLE: 409,
  RECORD_ALREADY_SETTLED: 409,
  RECORD_NOT_SETTLED: 409,
  SETTLE_TARGET_INVALID: 422,
  RECORD_IMMUTABLE_FIELD: 422,
  INVITE_NOT_FOUND: 404,
  INVITE_EXPIRED: 410,
  INVITE_USED: 410,
  INVITE_REVOKED: 410,
  FORBIDDEN: 403,
  RATE_LIMITED: 429,
  PRIVACY_PASSWORD_INVALID: 422,
  PRIVACY_LOCKED: 429,
  PRIVACY_UNAVAILABLE: 503,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
};

const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  UNAUTHENTICATED: "请先登录",
  LEDGER_REQUIRED: "缺少账本上下文（X-Ledger-Id）",
  LEDGER_FORBIDDEN: "你不是该账本成员",
  LEDGER_NOT_FOUND: "账本不存在",
  NOT_FOUND: "资源不存在",
  VALIDATION_ERROR: "参数校验失败",
  CONTACT_NAME_DUPLICATE: "该账本内已存在同名联系人",
  RECORD_NOT_SETTLEABLE: "只有「收到」记录可以结清",
  RECORD_ALREADY_SETTLED: "该记录已结清",
  RECORD_NOT_SETTLED: "该记录尚未结清",
  SETTLE_TARGET_INVALID: "关联结清的目标记录无效",
  RECORD_IMMUTABLE_FIELD: "联系人归属与收送方向不可修改，请删除后重建",
  INVITE_NOT_FOUND: "邀请不存在",
  INVITE_EXPIRED: "邀请已过期",
  INVITE_USED: "邀请已被使用",
  INVITE_REVOKED: "邀请已被撤销",
  FORBIDDEN: "没有操作权限",
  RATE_LIMITED: "操作过于频繁，请稍后再试",
  PRIVACY_PASSWORD_INVALID: "隐私密码不正确",
  PRIVACY_LOCKED: "密码错误次数过多，请稍后再试",
  PRIVACY_UNAVAILABLE: "隐私验证暂不可用，请检查服务端配置",
  CONFLICT: "数据冲突",
  INTERNAL_ERROR: "服务器开小差了",
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;
  readonly status: number;

  constructor(code: ErrorCode, details?: unknown, message?: string) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.name = "AppError";
    this.code = code;
    this.details = details;
    this.status = ERROR_STATUS[code];
  }
}

/** 判断 Prisma 唯一约束冲突，避免直接依赖生成的 Prisma 命名空间 */
export function isUniqueConstraintError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  const code = (error as { code?: unknown }).code;
  // P2002 = Prisma 的唯一约束错误；23505 = PostgreSQL 原生 unique_violation
  return code === "P2002" || code === "23505";
}
