import { requireSession } from "@/server/guards/session";
import { handle, readJson } from "@/server/http/route";
import { createLedger, listMyLedgers } from "@/server/services/ledger.service";
import { createLedgerSchema } from "@/server/validators/ledger";

export async function GET(req: Request) {
  return handle(req, async () => {
    const { userId } = await requireSession(req);
    return { items: await listMyLedgers(userId) };
  });
}

export async function POST(req: Request) {
  return handle(
    req,
    async () => {
      const { userId } = await requireSession(req);
      const input = createLedgerSchema.parse(await readJson(req));
      return { ledger: await createLedger(userId, input.name) };
    },
    { status: 201 },
  );
}
