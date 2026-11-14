import { requireSession } from "@/server/guards/session";
import { handle } from "@/server/http/route";
import { acceptInvite } from "@/server/services/invite.service";

type Params = { params: Promise<{ token: string }> };

export async function POST(req: Request, { params }: Params) {
  return handle(req, async () => {
    const { userId } = await requireSession(req);
    const { token } = await params;
    return acceptInvite(token, userId);
  });
}
