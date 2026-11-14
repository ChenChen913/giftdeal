import { requireLedgerContext } from "@/server/guards/ledger";
import { handle, readJsonOptional } from "@/server/http/route";
import { createInvite } from "@/server/services/invite.service";
import { createInviteSchema } from "@/server/validators/invite";

export async function POST(req: Request) {
  return handle(
    req,
    async () => {
      const ctx = await requireLedgerContext(req);
      const input = createInviteSchema.parse(await readJsonOptional(req));
      return { invite: await createInvite(ctx, input) };
    },
    { status: 201 },
  );
}
