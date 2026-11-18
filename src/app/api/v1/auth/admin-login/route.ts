import { NextResponse } from "next/server";

import { auth } from "@/server/auth";
import { devOnlyFlag, isProduction } from "@/server/env";
import { AppError } from "@/server/http/errors";
import { fail } from "@/server/http/envelope";
import { logServerError } from "@/server/http/log";
import { readJson } from "@/server/http/route";

const ADMIN_EMAIL = "admin@giftdeal.local";

/**
 * 内部快捷登录：只接受字面量 "admin"。
 *
 * 安全约束：
 * - 生产环境永远关闭（devOnlyFlag 为 false），即使误设 ALLOW_ADMIN_LOGIN=true 也不生效；
 * - 启动自检还会把 ALLOW_ADMIN_LOGIN=true 视为生产配置错误，直接拒绝启动；
 * - 密码只从 ADMIN_LOGIN_PASSWORD 读取，生产环境不会回退到 "123456"。
 */
function adminPassword(): string {
  const configured = process.env.ADMIN_LOGIN_PASSWORD?.trim();
  if (configured) return configured;
  if (isProduction) {
    throw new AppError("FORBIDDEN", undefined, "该登录方式未开启");
  }
  return "123456";
}

export async function POST(req: Request) {
  try {
    if (!devOnlyFlag("ALLOW_ADMIN_LOGIN")) {
      throw new AppError("FORBIDDEN", undefined, "该登录方式未开启");
    }

    const body = (await readJson(req)) as { account?: unknown } | null;
    const account = typeof body?.account === "string" ? body.account.trim() : "";

    if (account !== "admin") {
      throw new AppError("VALIDATION_ERROR", {
        fieldErrors: { account: ["该账号不存在"] },
      });
    }

    const result = await auth.api.signInEmail({
      body: { email: ADMIN_EMAIL, password: adminPassword() },
      returnHeaders: true,
    });

    const response = NextResponse.json({
      ok: true,
      data: { user: result.response?.user ?? null },
    });

    for (const cookie of result.headers.getSetCookie()) {
      response.headers.append("set-cookie", cookie);
    }

    return response;
  } catch (error) {
    if (error instanceof AppError) {
      return fail(error.code, error.message, error.details);
    }
    logServerError("auth/admin-login", error);
    return fail("INTERNAL_ERROR", "登录失败，请稍后重试");
  }
}

export const dynamic = "force-dynamic";
