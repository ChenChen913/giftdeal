import { requireLedgerContext } from "@/server/guards/ledger";
import { handle } from "@/server/http/route";
import { getOverview } from "@/server/services/stats.service";

export async function GET(req: Request) {
  return handle(req, async () => {
    const ctx = await requireLedgerContext(req);
    return getOverview(ctx.ledgerId);
  });
}
