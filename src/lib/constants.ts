/** 全局常量与受控字典 */

export const RECORD_DIRECTIONS = ["GIVEN", "RECEIVED"] as const;
export type RecordDirection = (typeof RECORD_DIRECTIONS)[number];

export const DIRECTION_LABELS: Record<RecordDirection, string> = {
  GIVEN: "送出",
  RECEIVED: "收到",
};

export const GIFT_SCENES = [
  "WEDDING",
  "BABY_FULL_MONTH",
  "BABY_HUNDRED_DAYS",
  "FUNERAL",
  "OTHER",
] as const;
export type GiftScene = (typeof GIFT_SCENES)[number];

export const SCENE_LABELS: Record<GiftScene, string> = {
  WEDDING: "婚礼",
  BABY_FULL_MONTH: "满月",
  BABY_HUNDRED_DAYS: "百岁",
  FUNERAL: "白事",
  OTHER: "其他",
};

export const MEMBERSHIP_ROLES = ["OWNER", "MEMBER"] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

export const RELATION_TAG_SUGGESTIONS = [
  "亲戚",
  "朋友",
  "同事",
  "同学",
  "邻居",
  "其他",
] as const;

export const LIMITS = {
  ledgerNameMax: 50,
  contactNameMax: 30,
  relationTagMax: 20,
  contactPhoneMax: 20,
  noteMax: 200,
  /** 单笔金额上限：10,000,000 分 = 10 万元 */
  amountMaxCents: 10_000_000,
  pageSizeDefault: 20,
  pageSizeMax: 100,
  /** 按人对账单次返回上限 */
  settlementRecordsMax: 500,
  inviteExpireDaysDefault: 7,
  inviteExpireDaysMax: 30,
  otpThrottleSeconds: 60,
} as const;

export const DEFAULT_LEDGER_NAME = "我的礼金账本";
