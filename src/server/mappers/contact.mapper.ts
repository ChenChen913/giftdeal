import type { GiftScene } from "@/lib/constants";

export type ContactStats = {
  givenTotalCents: number;
  receivedTotalCents: number;
  /** 收到 - 送出。正数表示我方收得多、欠对方人情 */
  netCents: number;
  recordCount: number;
  unsettledReceivedCount: number;
  unsettledReceivedCents: number;
  lastRecordAt: string | null;
  /** 与该亲友发生过的礼俗场景（去重，按固定顺序），用于前端筛选 */
  scenes: GiftScene[];
  /** 该亲友「预备中」的人情预备笔数（未来才会发生，不计入收支） */
  planCount: number;
};

export function emptyContactStats(): ContactStats {
  return {
    givenTotalCents: 0,
    receivedTotalCents: 0,
    netCents: 0,
    recordCount: 0,
    unsettledReceivedCount: 0,
    unsettledReceivedCents: 0,
    lastRecordAt: null,
    scenes: [],
    planCount: 0,
  };
}

export type ContactDto = {
  id: string;
  name: string;
  relationTag: string | null;
  phone: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  stats: ContactStats;
};

type ContactRow = {
  id: string;
  name: string;
  relationTag: string | null;
  phone: string | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function contactToDto(row: ContactRow, stats: ContactStats): ContactDto {
  return {
    id: row.id,
    name: row.name,
    relationTag: row.relationTag,
    phone: row.phone,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    stats,
  };
}

/** 按人对账的汇总：列表 stats 换成首末日期 + 双向笔数 */
export type SettlementSummary = Omit<ContactStats, "lastRecordAt" | "scenes" | "planCount"> & {
  givenCount: number;
  receivedCount: number;
  firstOccurredAt: string | null;
  lastOccurredAt: string | null;
};
