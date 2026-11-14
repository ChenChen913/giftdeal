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

/**
 * 亲友分组：名单里按「哪边的人、怎么认识的」分类。
 * 存库用 key，展示用 CONTACT_GROUP_LABELS；顺序即界面上的展示顺序。
 */
export const CONTACT_GROUPS = [
  "FATHER_SIDE",
  "MOTHER_SIDE",
  "PRIMARY_SCHOOL",
  "JUNIOR_SCHOOL",
  "HIGH_SCHOOL",
  "COLLEGE",
  "COLLEAGUE",
  "FRIEND",
  "OTHER",
] as const;

export type ContactGroup = (typeof CONTACT_GROUPS)[number];

export const CONTACT_GROUP_LABELS: Record<ContactGroup, string> = {
  FATHER_SIDE: "父系亲戚",
  MOTHER_SIDE: "母系亲戚",
  PRIMARY_SCHOOL: "小学同学",
  JUNIOR_SCHOOL: "初中同学",
  HIGH_SCHOOL: "高中同学",
  COLLEGE: "大学同学",
  COLLEAGUE: "同事",
  FRIEND: "好友",
  OTHER: "其他",
};

/** 分组 key → 中文；历史自由文本原样返回，避免旧数据显示空白 */
export function contactGroupLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return CONTACT_GROUP_LABELS[value as ContactGroup] ?? value;
}

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
