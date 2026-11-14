/** 与后端 DTO 一一对应的类型定义（见 docs/02-api-contract.md） */

export type RecordDirection = "GIVEN" | "RECEIVED";

export type GiftScene =
  | "WEDDING"
  | "BABY_FULL_MONTH"
  | "BABY_HUNDRED_DAYS"
  | "FUNERAL"
  | "OTHER";

export type MembershipRole = "OWNER" | "MEMBER";

export type MeUser = {
  id: string;
  name: string;
  phoneNumber: string;
  createdAt: string;
};

export type LedgerSummary = {
  id: string;
  name: string;
  role: MembershipRole;
  memberCount: number;
  contactCount?: number;
  recordCount?: number;
  isDefault: boolean;
  createdAt?: string;
};

export type MeResponse = {
  user: MeUser;
  defaultLedgerId: string;
  ledgers: LedgerSummary[];
};

export type ContactStats = {
  givenTotalCents: number;
  receivedTotalCents: number;
  netCents: number;
  recordCount: number;
  unsettledReceivedCount: number;
  unsettledReceivedCents: number;
  lastRecordAt: string | null;
  /** 与该亲友发生过的礼俗场景，用于按礼金性质筛选 */
  scenes: GiftScene[];
  /** 该亲友「预备中」的未来礼金笔数 */
  planCount: number;
};

export type Contact = {
  id: string;
  name: string;
  relationTag: string | null;
  phone: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  stats: ContactStats;
};

export type RecordItem = {
  id: string;
  ledgerId: string;
  contactId: string;
  contact: { id: string; name: string; relationTag: string | null };
  direction: RecordDirection;
  amountCents: number;
  amountYuan: string;
  scene: GiftScene;
  sceneLabel: string;
  occurredAt: string;
  note: string | null;
  isSettled: boolean;
  settledAt: string | null;
  settledByRecordId: string | null;
  settlesRecordId: string | null;
  /** 关联的人生大事；未归类时为 null */
  eventId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PendingItem = RecordItem & { daysSince: number };

export type PageResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  /** 结果被扫描上限截断时为 true：total 是真实总数，items 只含已加载部分 */
  truncated?: boolean;
};

export type PendingResult = PageResult<PendingItem> & {
  summary: { totalCount: number; totalCents: number };
};

export type SceneBreakdownItem = {
  scene: GiftScene;
  sceneLabel: string;
  count: number;
  totalCents: number;
};

export type PlanStatus = "PLANNED" | "DONE";
export type Plan = {
  id: string;
  ledgerId: string;
  contactId: string;
  contact: { id: string; name: string; relationTag: string | null };
  direction: RecordDirection;
  scene: GiftScene;
  sceneLabel: string;
  plannedCents: number;
  plannedYuan: string;
  expectedAt: string;
  /** 距预计日期还有几天：正数=未来，0=今天，负数=已过 */
  daysUntil: number;
  status: PlanStatus;
  note: string | null;
  recordId: string | null;
  completedAt: string | null;
  createdAt: string;
};

/** 一场人生大事的收送汇总 */
export type EventSummary = {
  givenTotalCents: number;
  receivedTotalCents: number;
  netCents: number;
  recordCount: number;
  /** 参与过这场事的亲友人数（去重） */
  participantCount: number;
  /** 单笔最大收礼 */
  maxReceivedCents: number;
};

/** 人生大事：婚礼、满月、百岁、白事…… */
export type LifeEvent = {
  id: string;
  ledgerId: string;
  title: string;
  scene: GiftScene;
  sceneLabel: string;
  occurredAt: string;
  location: string | null;
  note: string | null;
  hosted: boolean;
  createdAt: string;
  updatedAt: string;
  summary: EventSummary;
};

export type EventDetail = {
  event: LifeEvent;
  records: RecordItem[];
};

export type Overview = {
  ledgerId: string;
  contactCount: number;
  recordCount: number;
  givenCount: number;
  receivedCount: number;
  givenTotalCents: number;
  receivedTotalCents: number;
  netCents: number;
  pendingReturnCount: number;
  pendingReturnCents: number;
  planCount: number;
  planCents: number;
  nextPlan: Plan | null;
  sceneBreakdown: SceneBreakdownItem[];
};

export type SettlementSummary = {
  givenTotalCents: number;
  receivedTotalCents: number;
  netCents: number;
  recordCount: number;
  givenCount: number;
  receivedCount: number;
  unsettledReceivedCount: number;
  unsettledReceivedCents: number;
  firstOccurredAt: string | null;
  lastOccurredAt: string | null;
};

export type SettlementResponse = {
  contact: { id: string; name: string; relationTag: string | null };
  summary: SettlementSummary;
  records: RecordItem[];
  truncated: boolean;
};

export type LedgerMember = {
  userId: string;
  name: string;
  phoneNumberMasked: string;
  role: MembershipRole;
  joinedAt: string;
};

export type LedgerDetail = {
  id: string;
  name: string;
  role: MembershipRole;
  createdAt: string;
  members: LedgerMember[];
};

export type InviteInfo = {
  invite: {
    token: string;
    status: "PENDING" | "USED" | "EXPIRED" | "REVOKED";
    ledger: { id: string; name: string; memberCount: number };
    inviterName: string;
    expiresAt: string;
  };
  alreadyMember: boolean;
};
