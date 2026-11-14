import { requireSession } from "@/server/guards/session";
import { handle, readJson } from "@/server/http/route";
import { getMe, setDefaultLedger } from "@/server/services/ledger.service";
import { updateMeSchema } from "@/server/validators/ledger";

export async function GET(req: Request) {
  return handle(req, async () => {
    const { userId } = await requireSession(req);
    return getMe(userId);
  });
}

export async function PATCH(req: Request) {
  return handle(req, async () => {
    const { userId } = await requireSession(req);
    const input = updateMeSchema.parse(await readJson(req));

    if (input.defaultLedgerId) {
      await setDefaultLedger(userId, input.defaultLedgerId);
    }

    return getMe(userId);
  });
}
