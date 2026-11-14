import { z } from "zod";

import { LIMITS } from "@/lib/constants";

export const createInviteSchema = z.object({
  expiresInDays: z
    .number()
    .refine((v) => Number.isInteger(v), "天数必须是整数")
    .refine(
      (v) => v >= 1 && v <= LIMITS.inviteExpireDaysMax,
      `有效期需在 1 到 ${LIMITS.inviteExpireDaysMax} 天之间`,
    )
    .optional(),
});

export type CreateInviteInput = z.infer<typeof createInviteSchema>;
