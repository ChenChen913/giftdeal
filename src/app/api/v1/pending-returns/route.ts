import { requireLedgerContext } from "@/server/guards/ledger";
import { handle, intParam, strParam } from "@/server/http/route";
import { listPendingReturns } from "@/server/services/settlement.service";

export async function GET(req: Request) {
  return handle(req, async () => {
    const ctx = await requireLedgerContext(req);
    const sp = new URL(req.url).searchParams;

    const pageNo = intParam(sp, "page", 1, 1, 10_000);
    const pageSize = intParam(sp, "pageSize", 20, 1, 100);

    const result = await listPendingReturns(ctx, {
      contactId: strParam(sp, "contactId"),
      page: pageNo,
      pageSize,
    });

    return {
      items: result.items,
      page: pageNo,
      pageSize,
      total: result.total,
      summary: result.summary,
    };
  });
}
