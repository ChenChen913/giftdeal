import { GIFT_SCENES, RECORD_DIRECTIONS } from "@/lib/constants";

import { requireLedgerContext } from "@/server/guards/ledger";
import { page as pageEnvelope } from "@/server/http/envelope";
import { boolParam, enumParam, handle, intParam, readJson, strParam } from "@/server/http/route";
import { createRecord, listRecords } from "@/server/services/record.service";
import { dateOnlySchema } from "@/server/validators/common";
import { createRecordSchema } from "@/server/validators/record";

export async function GET(req: Request) {
  return handle(req, async () => {
    const ctx = await requireLedgerContext(req);
    const sp = new URL(req.url).searchParams;

    const rawFrom = strParam(sp, "from");
    const rawTo = strParam(sp, "to");

    const pageNo = intParam(sp, "page", 1, 1, 10_000);
    const pageSize = intParam(sp, "pageSize", 20, 1, 100);

    const { items, total } = await listRecords(ctx, {
      contactId: strParam(sp, "contactId"),
      direction: enumParam(sp, "direction", RECORD_DIRECTIONS),
      scene: enumParam(sp, "scene", GIFT_SCENES),
      settled: boolParam(sp, "settled"),
      from: rawFrom ? dateOnlySchema.parse(rawFrom) : undefined,
      to: rawTo ? dateOnlySchema.parse(rawTo) : undefined,
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
      const input = createRecordSchema.parse(await readJson(req));
      return createRecord(ctx, input);
    },
    { status: 201 },
  );
}
