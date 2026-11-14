import { DEFAULT_LEDGER_NAME } from "@/lib/constants";

import { prisma } from "./db";

class AlreadyBootstrapped extends Error {}

/**
 * 保证用户一定有一个默认账本。
 * 幂等：已有 defaultLedgerId 直接返回。
 *
 * 并发保护：先建账本，再用 `updateMany({ where: { defaultLedgerId: null } })` 抢占；
 * 抢不到说明别的请求先完成了，回滚本次事务并读回对方的结果，避免出现两个「默认账本」。
 */
export async function bootstrapUser(userId: string): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultLedgerId: true },
  });

  if (!existing) throw new Error(`用户不存在: ${userId}`);
  if (existing.defaultLedgerId) return existing.defaultLedgerId;

  try {
    return await prisma.$transaction(async (tx) => {
      const ledger = await tx.ledger.create({ data: { name: DEFAULT_LEDGER_NAME } });
      await tx.membership.create({
        data: { ledgerId: ledger.id, userId, role: "OWNER" },
      });

      const claimed = await tx.user.updateMany({
        where: { id: userId, defaultLedgerId: null },
        data: { defaultLedgerId: ledger.id },
      });

      if (claimed.count === 0) throw new AlreadyBootstrapped();

      return ledger.id;
    });
  } catch (error) {
    if (error instanceof AlreadyBootstrapped) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { defaultLedgerId: true },
      });
      if (user?.defaultLedgerId) return user.defaultLedgerId;
    }
    throw error;
  }
}
