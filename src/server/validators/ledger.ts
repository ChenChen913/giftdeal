import { z } from "zod";

import { LIMITS } from "@/lib/constants";

import { atLeastOneField, trimmedText } from "./common";

export const createLedgerSchema = z.object({
  name: trimmedText(LIMITS.ledgerNameMax, "账本名"),
});

export const updateLedgerSchema = z.object({
  name: trimmedText(LIMITS.ledgerNameMax, "账本名"),
});

export const updateMeSchema = atLeastOneField(
  z.object({
    defaultLedgerId: z.string().trim().min(1).max(64).optional(),
  }),
  "至少提供一个待更新字段",
);

export type CreateLedgerInput = z.infer<typeof createLedgerSchema>;
