import { requireLedgerContext } from "@/server/guards/ledger";
import { handle, strParam } from "@/server/http/route";
import { getContactSettlement } from "@/server/services/settlement.service";
import { dateOnlySchema } from "@/server/validators/common";

type Params = { params: Promise<{ contactId: string }> };

export async function GET(req: Request, { params }: Params) {
  return handle(req, async () => {
    const ctx = await requireLedgerContext(req);
    const { contactId } = await params;
    const sp = new URL(req.url).searchParams;

    const rawFrom = strParam(sp, "from");
    const rawTo = strParam(sp, "to");

    return getContactSettlement(ctx, contactId, {
      from: rawFrom ? dateOnlySchema.parse(rawFrom) : undefined,
      to: rawTo ? dateOnlySchema.parse(rawTo) : undefined,
    });
  });
}
