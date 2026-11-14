import { handle } from "@/server/http/route";
import { requireSession } from "@/server/guards/session";
import { privacyStatus } from "@/server/privacy";

/** 查询当前会话是否已解锁真实数据 */
export async function GET(req: Request) {
  return handle(req, async () => {
    const session = await requireSession(req);
    return privacyStatus(req, session.userId);
  });
}

export const dynamic = "force-dynamic";
