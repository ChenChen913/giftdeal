import { z } from "zod";

import { LIMITS } from "@/lib/constants";

import { atLeastOneField, optionalText, trimmedText } from "./common";

const relationTag = optionalText(LIMITS.relationTagMax, "关系标签");
const phone = optionalText(LIMITS.contactPhoneMax, "手机号");
const note = optionalText(LIMITS.noteMax, "备注");

export const createContactSchema = z.object({
  name: trimmedText(LIMITS.contactNameMax, "姓名"),
  relationTag,
  phone,
  note,
});

export const updateContactSchema = atLeastOneField(
  z.object({
    name: trimmedText(LIMITS.contactNameMax, "姓名").optional(),
    relationTag,
    phone,
    note,
  }),
  "至少提供一个待更新字段",
);

export const contactQuerySchema = z.object({
  q: z.string().trim().max(LIMITS.contactNameMax).optional(),
  sort: z.enum(["recent", "name"]).default("recent"),
});

export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
