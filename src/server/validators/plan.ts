import { z } from "zod";

import { GIFT_SCENES, LIMITS, RECORD_DIRECTIONS } from "@/lib/constants";
import { isExpectedAtInRange } from "@/lib/date";

import { amountCentsSchema, atLeastOneField, optionalText } from "./common";

const note = optionalText(LIMITS.noteMax, "备注");

export const createPlanSchema = z.object({
  contactId: z.string().trim().min(1, "请选择亲友").max(64),
  direction: z.enum(RECORD_DIRECTIONS).default("GIVEN"),
  scene: z.enum(GIFT_SCENES),
  plannedCents: amountCentsSchema,
  expectedAt: z
    .string()
    .refine(isExpectedAtInRange, "预计日期需在 1950-01-01 到 5 年后之间"),
  note,
});

export const updatePlanSchema = atLeastOneField(
  z.object({
    direction: z.enum(RECORD_DIRECTIONS).optional(),
    scene: z.enum(GIFT_SCENES).optional(),
    plannedCents: amountCentsSchema.optional(),
    expectedAt: z
      .string()
      .refine(isExpectedAtInRange, "预计日期需在 1950-01-01 到 5 年后之间")
      .optional(),
    note,
  }),
  "至少提供一个待更新字段",
);

export const completePlanSchema = z.object({
  /** 完成时是否同时记一笔真实礼金 */
  createRecord: z.boolean().optional().default(true),
  /** 实际发生日期，默认今天 */
  occurredAt: z
    .string()
    .refine(isExpectedAtInRange, "日期格式必须是 YYYY-MM-DD 且真实存在")
    .optional(),
  /** 实际金额，默认用预计金额 */
  amountCents: amountCentsSchema.optional(),
});

export type CreatePlanInput = z.infer<typeof createPlanSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;
export type CompletePlanInput = z.infer<typeof completePlanSchema>;
