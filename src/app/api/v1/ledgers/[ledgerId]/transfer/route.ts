import { z } from "zod";

import { requireLedgerById } from "@/server/guards/ledger";
import { handle, readJson } from "@/server/http/route";
import { transferOwnership } from "@/server/services/ledger.service";

const schema = z.object({
  userId: z.string().trim().min(1, "请选择接手成员").max(64),
});

type Params = { params: Promise<{ ledgerId: string }> };

/** 把管理员转让给本账本的其他成员 */
export async function POST(req: Request, { params }: Params) {
  return handle(req, async () => {
    const { ledgerId } = await params;
    const ctx = await requireLedgerById(req, ledgerId);
    const { userId } = schema.parse(await readJson(req));
    return transferOwnership(ctx, userId);
  });
}
