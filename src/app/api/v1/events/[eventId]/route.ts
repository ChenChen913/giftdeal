import { requireLedgerContext } from "@/server/guards/ledger";
import { handle, readJson } from "@/server/http/route";
import { deleteEvent, getEventDetail, updateEvent } from "@/server/services/event.service";
import { updateEventSchema } from "@/server/validators/event";

type Params = { params: Promise<{ eventId: string }> };

export async function GET(req: Request, { params }: Params) {
  return handle(req, async () => {
    const { eventId } = await params;
    const ctx = await requireLedgerContext(req);
    return getEventDetail(ctx, eventId);
  });
}

export async function PATCH(req: Request, { params }: Params) {
  return handle(req, async () => {
    const { eventId } = await params;
    const ctx = await requireLedgerContext(req);
    const input = updateEventSchema.parse(await readJson(req));
    return { event: await updateEvent(ctx, eventId, input) };
  });
}

export async function DELETE(req: Request, { params }: Params) {
  return handle(req, async () => {
    const { eventId } = await params;
    const ctx = await requireLedgerContext(req);
    return deleteEvent(ctx, eventId);
  });
}
