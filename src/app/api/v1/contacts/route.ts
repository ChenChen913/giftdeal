import { requireLedgerContext } from "@/server/guards/ledger";
import { page as pageEnvelope } from "@/server/http/envelope";
import { enumParam, handle, intParam, readJson, strParam } from "@/server/http/route";
import { createContact, listContacts } from "@/server/services/contact.service";
import { createContactSchema } from "@/server/validators/contact";

export async function GET(req: Request) {
  return handle(req, async () => {
    const ctx = await requireLedgerContext(req);
    const sp = new URL(req.url).searchParams;

    const q = strParam(sp, "q");
    const sort = enumParam(sp, "sort", ["recent", "name"] as const) ?? "recent";
    const pageNo = intParam(sp, "page", 1, 1, 10_000);
    // 名录页与「记一笔」需要一次拿到整个账本的亲友，上限单独放宽到 500
    const pageSize = intParam(sp, "pageSize", 20, 1, 500);

    const { items, total, truncated } = await listContacts(ctx, {
      q,
      sort,
      page: pageNo,
      pageSize,
    });
    return pageEnvelope(items, total, pageNo, pageSize, truncated);
  });
}

export async function POST(req: Request) {
  return handle(
    req,
    async () => {
      const ctx = await requireLedgerContext(req);
      const input = createContactSchema.parse(await readJson(req));
      return { contact: await createContact(ctx, input) };
    },
    { status: 201 },
  );
}
