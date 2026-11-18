import type { NextResponse } from "next/server";
import { ZodError } from "zod";

import { AppError, isUniqueConstraintError } from "./errors";
import { fail, ok } from "./envelope";
import { logServerError } from "./log";

type HandleInit = { status?: number };

/**
 * 路由统一入口：成功包 { ok, data }，失败按错误码映射 HTTP 状态。
 * 任何未预期异常都不会把堆栈/数据库细节透给客户端。
 */
export async function handle(
  req: Request,
  fn: () => Promise<unknown>,
  init?: HandleInit,
): Promise<NextResponse> {
  try {
    const data = await fn();
    return ok(data ?? null, init?.status ?? 200);
  } catch (error) {
    return toErrorResponse(error, req);
  }
}

export function toErrorResponse(error: unknown, req: Request): NextResponse {
  if (error instanceof AppError) {
    return fail(error.code, error.message, error.details);
  }

  if (error instanceof ZodError) {
    return fail("VALIDATION_ERROR", "参数校验失败", {
      fieldErrors: collectFieldErrors(error),
    });
  }

  if (isUniqueConstraintError(error)) {
    return fail("CONFLICT", "数据冲突");
  }

  const { pathname } = new URL(req.url);
  logServerError(`api ${req.method} ${pathname}`, error);
  return fail("INTERNAL_ERROR", "服务器开小差了");
}

function collectFieldErrors(error: ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fieldErrors;
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new AppError("VALIDATION_ERROR", {
      fieldErrors: { _: ["请求体不是合法的 JSON"] },
    });
  }
}

/** 允许空 body 的接口用（例如生成邀请） */
export async function readJsonOptional(req: Request): Promise<unknown> {
  const text = await req.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("VALIDATION_ERROR", {
      fieldErrors: { _: ["请求体不是合法的 JSON"] },
    });
  }
}

// ------------------------------------------------------------
// 查询参数解析（查询串一律是字符串，单独处理，避免 zod coerce 的边界问题）
// ------------------------------------------------------------

export function intParam(
  sp: URLSearchParams,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = sp.get(key);
  if (raw === null || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new AppError("VALIDATION_ERROR", {
      fieldErrors: { [key]: [`必须是 ${min} 到 ${max} 之间的整数`] },
    });
  }
  return value;
}

export function boolParam(sp: URLSearchParams, key: string): boolean | undefined {
  const raw = sp.get(key);
  if (raw === null || raw === "") return undefined;
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  throw new AppError("VALIDATION_ERROR", {
    fieldErrors: { [key]: ["只能是 true 或 false"] },
  });
}

export function strParam(sp: URLSearchParams, key: string): string | undefined {
  const raw = sp.get(key);
  if (raw === null) return undefined;
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function enumParam<T extends string>(
  sp: URLSearchParams,
  key: string,
  allowed: readonly T[],
): T | undefined {
  const raw = sp.get(key);
  if (raw === null || raw === "") return undefined;
  if (!(allowed as readonly string[]).includes(raw)) {
    throw new AppError("VALIDATION_ERROR", {
      fieldErrors: { [key]: [`只能是 ${allowed.join(" / ")} 之一`] },
    });
  }
  return raw as T;
}
