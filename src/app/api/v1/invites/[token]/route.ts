import { requireSession } from "@/server/guards/session";
import { handle } from "@/server/http/route";
import { getInvite, revokeInvite } from "@/server/services/invite.service";

type Params = { params: Promise<{ token: string }> };

export async function GET(req: Request, { params }: Params) {
  return handle(req, async () => {
    const { userId } = await requireSession(req);
    const { token } = await params;
    return getInvite(token, userId);
  });
}

export async function DELETE(req: Request, { params }: Params) {
  return handle(req, async () => {
    const { userId } = await requireSession(req);
    const { token } = await params;
    return revokeInvite(token, userId);
  });
}
