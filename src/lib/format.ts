import type { GiftScene, RecordDirection } from "./types";

/** 分 → 展示金额，整数元不带小数（¥42,800），有零头才带两位（¥1,234.50） */
export function formatAmount(cents: number, withSymbol = true): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const yuan = abs / 100;
  const text = Number.isInteger(yuan)
    ? yuan.toLocaleString("zh-CN")
    : yuan.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${negative ? "-" : ""}${withSymbol ? "¥" : ""}${text}`;
}

/** 2026-03-08 → 2026.03.08 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return value.slice(0, 10).replace(/-/g, ".");
}

/** 场景配色：婚宴朱柿赤、满月琥珀、百岁赭石、白事青灰、其他暖灰 */
export const SCENE_COLORS: Record<GiftScene, string> = {
  WEDDING: "#c84630",
  BABY_FULL_MONTH: "#d99a4e",
  BABY_HUNDRED_DAYS: "#b5762f",
  FUNERAL: "#59636a",
  OTHER: "#a99a8c",
};

export const SCENE_TONE: Record<GiftScene, string> = {
  WEDDING: "chip-primary",
  BABY_FULL_MONTH: "chip-amber",
  BABY_HUNDRED_DAYS: "chip-amber",
  FUNERAL: "chip-slate",
  OTHER: "chip-neutral",
};

export const DIRECTION_LABEL: Record<RecordDirection, string> = {
  GIVEN: "送出",
  RECEIVED: "收到",
};

/** 净差额的「礼俗化」表述，避免像股票涨跌 */
export function netStance(netCents: number): { title: string; hint: string; tone: string } {
  if (netCents > 0) {
    return {
      title: "承蒙厚爱",
      hint: "对方给的多，宜择机回礼",
      tone: "primary",
    };
  }
  if (netCents < 0) {
    return {
      title: "厚谊在彼",
      hint: "我方给的多，对方尚欠人情",
      tone: "secondary",
    };
  }
  return { title: "往还平衡", hint: "礼数相当，各自安好", tone: "neutral" };
}

/** 头像取姓氏（第一个字），与中文称谓习惯一致 */
export function avatarText(name: string): string {
  const trimmed = name.trim();
  return trimmed.slice(0, 1);
}
