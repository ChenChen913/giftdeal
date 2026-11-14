import { z } from "zod";

import { GIFT_SCENES, LIMITS } from "@/lib/constants";

import { atLeastOneField, occurredAtSchema, optionalText, trimmedText } from "./common";

const title = trimmedText(50, "事件名称");
const location = optionalText(100, "地点");
const note = optionalText(LIMITS.noteMax, "备注");

export const createEventSchema = z.object({
  title,
  scene: z.enum(GIFT_SCENES),
  occurredAt: occurredAtSchema,
  location,
  note,
  hosted: z.boolean().optional(),
});

export const updateEventSchema = atLeastOneField(
  z.object({
    title: title.optional(),
    scene: z.enum(GIFT_SCENES).optional(),
    occurredAt: occurredAtSchema.optional(),
    location,
    note,
    hosted: z.boolean().optional(),
  }),
  "至少提供一个待更新字段",
);

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
