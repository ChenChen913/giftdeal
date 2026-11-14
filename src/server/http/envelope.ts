import { NextResponse } from "next/server";

import type { ErrorCode } from "./errors";
import { ERROR_STATUS } from "./errors";

export type ApiSuccess<T> = { ok: true; data: T };
export type ApiFailure = {
  ok: false;
  error: { code: ErrorCode; message: string; details?: unknown };
};

export function ok<T>(data: T, status = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(
  code: ErrorCode,
  message: string,
  details?: unknown,
  status?: number,
): NextResponse<ApiFailure> {
  const body: ApiFailure = { ok: false, error: { code, message } };
  if (details !== undefined) body.error.details = details;
  return NextResponse.json(body, { status: status ?? ERROR_STATUS[code] });
}

export type Page<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  /** true 表示本次结果被扫描上限截断，items 不是全集（total 仍是真实总数） */
  truncated?: boolean;
};

export function page<T>(
  items: T[],
  total: number,
  pageNo: number,
  pageSize: number,
  truncated?: boolean,
): Page<T> {
  return truncated === undefined
    ? { items, page: pageNo, pageSize, total }
    : { items, page: pageNo, pageSize, total, truncated };
}
