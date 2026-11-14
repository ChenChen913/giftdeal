import { requireLedgerContext } from "@/server/guards/ledger";
import { handle, readJson } from "@/server/http/route";
import {
  deleteContact,
  getContact,
  updateContact,
} from "@/server/services/contact.service";
import { updateContactSchema } from "@/server/validators/contact";

type Params = { params: Promise<{ contactId: string }> };

export async function GET(req: Request, { params }: Params) {
  return handle(req, async () => {
    const ctx = await requireLedgerContext(req);
    const { contactId } = await params;
    return { contact: await getContact(ctx, contactId) };
  });
}

export async function PATCH(req: Request, { params }: Params) {
  return handle(req, async () => {
    const ctx = await requireLedgerContext(req);
    const { contactId } = await params;
    const input = updateContactSchema.parse(await readJson(req));
    return { contact: await updateContact(ctx, contactId, input) };
  });
}

export async function DELETE(req: Request, { params }: Params) {
  return handle(req, async () => {
    const ctx = await requireLedgerContext(req);
    const { contactId } = await params;
    return deleteContact(ctx, contactId);
  });
}
