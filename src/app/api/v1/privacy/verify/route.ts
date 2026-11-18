import { ok } from "@/server/http/envelope";
import { readJson, toErrorResponse } from "@/server/http/route";
import { requireSession } from "@/server/guards/session";
import { PRIVACY_COOKIE, verifyPrivacyPassword } from "@/server/privacy";
import { z } from "zod";

const schema = z.object({
  password: z.string().trim().min(1, "请输入隐私密码").max(64, "密码过长"),
});

/** 校验隐私密码，通过后签发 8 小时有效的 httpOnly Cookie */
export async function POST(req: Request) {
  try {
    const session = await requireSession(req);
    const { password } = schema.parse(await readJson(req));
    const cookie = await verifyPrivacyPassword(session.userId, password);

    const response = ok({ unlocked: true, expiresAt: cookie.expiresAt });
    response.cookies.set(PRIVACY_COOKIE, cookie.value, {
      httpOnly: true,
      sameSite: "lax",
      secure: req.url.startsWith("https://"),
      path: "/",
      maxAge: cookie.maxAge,
    });
    return response;
  } catch (error) {
    return toErrorResponse(error, req);
  }
}

export const dynamic = "force-dynamic";
