import { requireLedgerContext } from "@/server/guards/ledger";
import { AppError } from "@/server/http/errors";
import { handle, readJson } from "@/server/http/route";
import {
  deleteRecord,
  getRecord,
  updateRecord,
} from "@/server/services/record.service";
import { updateRecordSchema } from "@/server/validators/record";

type Params = { params: Promise<{ recordId: string }> };

export async function GET(req: Request, { params }: Params) {
  return handle(req, async () => {
    const ctx = await requireLedgerContext(req);
    const { recordId } = await params;
    return { record: await getRecord(ctx, recordId) };
  });
}

export async function PATCH(req: Request, { params }: Params) {
  return handle(req, async () => {
    const ctx = await requireLedgerContext(req);
    const { recordId } = await params;

    const body = await readJson(req);
    if (body && typeof body === "object") {
      const keys = Object.keys(body as Record<string, unknown>);
      if (keys.includes("contactId") || keys.includes("direction")) {
        throw new AppError("RECORD_IMMUTABLE_FIELD");
      }
    }

    const input = updateRecordSchema.parse(body);
    return { record: await updateRecord(ctx, recordId, input) };
  });
}

export async function DELETE(req: Request, { params }: Params) {
  return handle(req, async () => {
    const ctx = await requireLedgerContext(req);
    const { recordId } = await params;
    return deleteRecord(ctx, recordId);
  });
}
