import { requireLedgerContext } from "@/server/guards/ledger";
import { handle, readJson } from "@/server/http/route";
import { deletePlan, getPlan, updatePlan } from "@/server/services/plan.service";
import { updatePlanSchema } from "@/server/validators/plan";

type Params = { params: Promise<{ planId: string }> };

export async function GET(req: Request, { params }: Params) {
  return handle(req, async () => {
    const ctx = await requireLedgerContext(req);
    const { planId } = await params;
    return { plan: await getPlan(ctx, planId) };
  });
}

export async function PATCH(req: Request, { params }: Params) {
  return handle(req, async () => {
    const ctx = await requireLedgerContext(req);
    const { planId } = await params;
    const input = updatePlanSchema.parse(await readJson(req));
    return { plan: await updatePlan(ctx, planId, input) };
  });
}

export async function DELETE(req: Request, { params }: Params) {
  return handle(req, async () => {
    const ctx = await requireLedgerContext(req);
    const { planId } = await params;
    return deletePlan(ctx, planId);
  });
}
