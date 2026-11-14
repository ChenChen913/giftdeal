import { z } from "zod";

import { CONTACT_GROUPS, LIMITS } from "@/lib/constants";

import { atLeastOneField, optionalText, trimmedText } from "./common";

/** 亲友分组是受控枚举；null 表示未分组 */
const relationTag = z.enum(CONTACT_GROUPS).nullable().optional();
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
