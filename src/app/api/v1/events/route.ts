import { requireLedgerContext } from "@/server/guards/ledger";
import { page as pageEnvelope } from "@/server/http/envelope";
import { handle, intParam, readJson } from "@/server/http/route";
import { createEvent, listEvents } from "@/server/services/event.service";
import { createEventSchema } from "@/server/validators/event";

export async function GET(req: Request) {
  return handle(req, async () => {
    const ctx = await requireLedgerContext(req);
    const sp = new URL(req.url).searchParams;

    const pageNo = intParam(sp, "page", 1, 1, 10_000);
    const pageSize = intParam(sp, "pageSize", 20, 1, 200);

    const { items, total } = await listEvents(ctx, { page: pageNo, pageSize });
    return pageEnvelope(items, total, pageNo, pageSize);
  });
}

export async function POST(req: Request) {
  return handle(
    req,
    async () => {
      const ctx = await requireLedgerContext(req);
      const input = createEventSchema.parse(await readJson(req));
      return { event: await createEvent(ctx, input) };
    },
    { status: 201 },
  );
}
