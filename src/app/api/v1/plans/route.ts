import { requireLedgerContext } from "@/server/guards/ledger";
import { page as pageEnvelope } from "@/server/http/envelope";
import { enumParam, handle, intParam, readJson, strParam } from "@/server/http/route";
import { createPlan, listPlans } from "@/server/services/plan.service";
import { createPlanSchema } from "@/server/validators/plan";

const STATUSES = ["PLANNED", "DONE", "ALL"] as const;

export async function GET(req: Request) {
  return handle(req, async () => {
    const ctx = await requireLedgerContext(req);
    const sp = new URL(req.url).searchParams;

    const status = enumParam(sp, "status", STATUSES) ?? "PLANNED";
    const pageNo = intParam(sp, "page", 1, 1, 10_000);
    const pageSize = intParam(sp, "pageSize", 50, 1, 100);

    const { items, total } = await listPlans(ctx, {
      status,
      contactId: strParam(sp, "contactId"),
      page: pageNo,
      pageSize,
    });

    return pageEnvelope(items, total, pageNo, pageSize);
  });
}

export async function POST(req: Request) {
  return handle(
    req,
    async () => {
      const ctx = await requireLedgerContext(req);
      const input = createPlanSchema.parse(await readJson(req));
      return { plan: await createPlan(ctx, input) };
    },
    { status: 201 },
  );
}
