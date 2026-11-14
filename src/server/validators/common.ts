import { z } from "zod";

import { LIMITS } from "@/lib/constants";
import { isOccurredAtInRange, isRealDateOnly } from "@/lib/date";

/** 去首尾空格后校验长度，避免 "   " 这种"看起来有值"的输入 */
export function trimmedText(max: number, label: string) {
  return z
    .string()
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .min(1, `${label}不能为空`)
        .max(max, `${label}不能超过 ${max} 个字符`),
    );
}

/** 可选文本：null 表示清空 */
export function optionalText(max: number, label: string) {
  return z
    .string()
    .max(max, `${label}不能超过 ${max} 个字符`)
    .transform((value) => value.trim())
    .nullable()
    .optional();
}

export const dateOnlySchema = z
  .string()
  .refine(isRealDateOnly, "日期格式必须是 YYYY-MM-DD 且真实存在");

export const occurredAtSchema = z
  .string()
  .refine(isOccurredAtInRange, "礼金日期需在 1950-01-01 到明年今日之间");

export const amountCentsSchema = z
  .number({ error: "金额必须是数字（单位：分）" })
  .refine((value) => Number.isInteger(value), "金额必须是整数（单位：分）")
  .refine((value) => value > 0, "金额必须大于 0")
  .refine(
    (value) => value <= LIMITS.amountMaxCents,
    `单笔金额不能超过 ${LIMITS.amountMaxCents / 100} 元`,
  );

export const idSchema = z.string().trim().min(1, "ID 不能为空").max(64, "ID 过长");

export function atLeastOneField<T extends z.ZodType>(schema: T, message: string) {
  return schema.refine(
    (value) => Object.keys(value as Record<string, unknown>).length > 0,
    message,
  );
}
