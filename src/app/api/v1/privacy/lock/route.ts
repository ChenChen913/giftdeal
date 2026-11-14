import { ok } from "@/server/http/envelope";
import { toErrorResponse } from "@/server/http/route";
import { requireSession } from "@/server/guards/session";
import { PRIVACY_COOKIE } from "@/server/privacy";

/** 主动重新锁定：清除解锁 Cookie，界面立刻恢复遮罩 */
export async function POST(req: Request) {
  try {
    await requireSession(req);
    const response = ok({ unlocked: false, expiresAt: null });
    response.cookies.set(PRIVACY_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: req.url.startsWith("https://"),
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    return toErrorResponse(error, req);
  }
}

export const dynamic = "force-dynamic";
