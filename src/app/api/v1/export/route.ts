import { requireLedgerContext } from "@/server/guards/ledger";
import { AppError } from "@/server/http/errors";
import { handle } from "@/server/http/route";
import { privacyStatus } from "@/server/privacy";
import { exportLedger } from "@/server/services/export.service";

/**
 * 导出账本全量数据。
 * 出参含真实姓名与金额，所以要求隐私模式已解锁——否则一个被旁人拿到的
 * 登录态就能把整本账拖走，绕过界面上的遮罩。
 */
export async function GET(req: Request) {
  return handle(req, async () => {
    const ctx = await requireLedgerContext(req);

    if (!privacyStatus(req, ctx.userId).unlocked) {
      throw new AppError("FORBIDDEN", undefined, "导出包含真实金额与姓名，请先解锁隐私模式");
    }

    return { export: await exportLedger(ctx) };
  });
}

export const dynamic = "force-dynamic";
