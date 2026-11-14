import { z } from "zod";

import { GIFT_SCENES, LIMITS, RECORD_DIRECTIONS } from "@/lib/constants";

import { amountCentsSchema, atLeastOneField, occurredAtSchema, optionalText } from "./common";

const note = optionalText(LIMITS.noteMax, "备注");

export const createRecordSchema = z
  .object({
    contactId: z.string().trim().min(1, "请选择联系人").max(64),
    direction: z.enum(RECORD_DIRECTIONS),
    amountCents: amountCentsSchema,
    scene: z.enum(GIFT_SCENES),
    occurredAt: occurredAtSchema,
    note,
    settlesRecordId: z.string().trim().min(1).max(64).optional(),
    settled: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.settlesRecordId && value.direction !== "GIVEN") {
      ctx.addIssue({
        code: "custom",
        path: ["settlesRecordId"],
        message: "只有「送出」记录才能关联结清",
      });
    }
    if (value.settled && value.direction !== "RECEIVED") {
      ctx.addIssue({
        code: "custom",
        path: ["settled"],
        message: "只有「收到」记录才能标记已结清",
      });
    }
    if (value.settlesRecordId && value.settled) {
      ctx.addIssue({
        code: "custom",
        path: ["settled"],
        message: "关联结清与直接标记已结清不能同时使用",
      });
    }
  });

export const updateRecordSchema = atLeastOneField(
  z.object({
    amountCents: amountCentsSchema.optional(),
    scene: z.enum(GIFT_SCENES).optional(),
    occurredAt: occurredAtSchema.optional(),
    note,
  }),
  "至少提供一个待更新字段",
);

export type CreateRecordInput = z.infer<typeof createRecordSchema>;
export type UpdateRecordInput = z.infer<typeof updateRecordSchema>;
