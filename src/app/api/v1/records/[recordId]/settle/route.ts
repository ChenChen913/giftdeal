import { requireLedgerContext } from "@/server/guards/ledger";
import { handle } from "@/server/http/route";
import { settleRecord } from "@/server/services/record.service";

type Params = { params: Promise<{ recordId: string }> };

export async function POST(req: Request, { params }: Params) {
  return handle(req, async () => {
    const ctx = await requireLedgerContext(req);
    const { recordId } = await params;
    return { record: await settleRecord(ctx, recordId) };
  });
}
