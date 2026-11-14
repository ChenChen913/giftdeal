import { requireLedgerById } from "@/server/guards/ledger";
import { handle } from "@/server/http/route";
import { leaveLedger } from "@/server/services/ledger.service";

type Params = { params: Promise<{ ledgerId: string }> };

/** 退出账本（仅 MEMBER；OWNER 必须先转让） */
export async function DELETE(req: Request, { params }: Params) {
  return handle(req, async () => {
    const { ledgerId } = await params;
    const ctx = await requireLedgerById(req, ledgerId);
    return leaveLedger(ctx);
  });
}
