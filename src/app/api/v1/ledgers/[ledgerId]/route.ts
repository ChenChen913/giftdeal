import { requireLedgerById } from "@/server/guards/ledger";
import { handle, readJson } from "@/server/http/route";
import { getLedgerDetail, renameLedger } from "@/server/services/ledger.service";
import { updateLedgerSchema } from "@/server/validators/ledger";

type Params = { params: Promise<{ ledgerId: string }> };

export async function GET(req: Request, { params }: Params) {
  return handle(req, async () => {
    const { ledgerId } = await params;
    const ctx = await requireLedgerById(req, ledgerId);
    return { ledger: await getLedgerDetail(ctx) };
  });
}

export async function PATCH(req: Request, { params }: Params) {
  return handle(req, async () => {
    const { ledgerId } = await params;
    const ctx = await requireLedgerById(req, ledgerId);
    const input = updateLedgerSchema.parse(await readJson(req));
    return { ledger: await renameLedger(ctx, input.name) };
  });
}
