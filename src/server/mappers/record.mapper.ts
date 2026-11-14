import { SCENE_LABELS, type GiftScene, type RecordDirection } from "@/lib/constants";
import { toDateOnly } from "@/lib/date";
import { centsToYuan } from "@/lib/money";

/** 记录 DTO —— 全接口统一，前端只需实现一次类型 */
export type RecordDto = {
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

type RecordRow = {
  id: string;
  ledgerId: string;
  contactId: string;
  direction: string;
  amountCents: number;
  scene: string;
  occurredAt: Date;
  note: string | null;
  settledAt: Date | null;
  settledByRecordId: string | null;
  eventId: string | null;
  createdAt: Date;
  updatedAt: Date;
  contact: { id: string; name: string; relationTag: string | null };
  settledRecord?: { id: string } | null;
};

export function recordToDto(row: RecordRow): RecordDto {
  return {
    id: row.id,
    ledgerId: row.ledgerId,
    contactId: row.contactId,
    contact: {
      id: row.contact.id,
      name: row.contact.name,
      relationTag: row.contact.relationTag,
    },
    direction: row.direction as RecordDirection,
    amountCents: row.amountCents,
    amountYuan: centsToYuan(row.amountCents),
    scene: row.scene as GiftScene,
    sceneLabel: SCENE_LABELS[row.scene as GiftScene] ?? row.scene,
    occurredAt: toDateOnly(row.occurredAt),
    note: row.note,
    isSettled: row.settledAt !== null,
    settledAt: row.settledAt ? row.settledAt.toISOString() : null,
    settledByRecordId: row.settledByRecordId,
    settlesRecordId: row.settledRecord?.id ?? null,
    eventId: row.eventId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** 查询记录时统一的 include，保证 DTO 字段齐全 */
export const recordInclude = {
  contact: { select: { id: true, name: true, relationTag: true } },
  settledRecord: { select: { id: true } },
} as const;
