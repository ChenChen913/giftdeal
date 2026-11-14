import { requireLedgerContext } from "@/server/guards/ledger";
import { handle, readJsonOptional } from "@/server/http/route";
import { completePlan } from "@/server/services/plan.service";
import { completePlanSchema } from "@/server/validators/plan";

type Params = { params: Promise<{ planId: string }> };

export async function POST(req: Request, { params }: Params) {
  return handle(req, async () => {
    const ctx = await requireLedgerContext(req);
    const { planId } = await params;
    const input = completePlanSchema.parse(await readJsonOptional(req));
    return completePlan(ctx, planId, input);
  });
}
