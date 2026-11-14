import { NextResponse } from "next/server";

import { auth } from "@/server/auth";
import { AppError } from "@/server/http/errors";
import { fail } from "@/server/http/envelope";
import { readJson } from "@/server/http/route";

const ADMIN_EMAIL = "admin@giftdeal.local";
const ADMIN_PASSWORD = process.env.ADMIN_LOGIN_PASSWORD ?? "123456";

/**
 * 内部快捷登录：只接受字面量 "admin"。
 * 前端不出现密码框，密码只在服务端使用；生产环境把 ALLOW_ADMIN_LOGIN 设为 false 即关闭。
 */
export async function POST(req: Request) {
  try {
    if (process.env.ALLOW_ADMIN_LOGIN !== "true") {
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
      body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
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
    console.error("[auth] admin-login 失败", error);
    return fail("INTERNAL_ERROR", "登录失败，请稍后重试");
  }
}

export const dynamic = "force-dynamic";
