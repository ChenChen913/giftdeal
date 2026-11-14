import { and, count, eq, ilike, isNull, ne } from "drizzle-orm";

import { AppError, isUniqueConstraintError } from "@/server/http/errors";
import {
  contactToDto,
  emptyContactStats,
  type ContactDto,
} from "@/server/mappers/contact.mapper";
import { db } from "@/server/db-drizzle";
import type { LedgerContext } from "@/server/guards/ledger";
import { contact, record } from "@/server/schema";
import type { CreateContactInput, UpdateContactInput } from "@/server/validators/contact";
import { contactStatsMap } from "./stats.service";

/**
 * 单次扫描上限。排序依赖「最近往来」这类由 Record 聚合出来的字段，
 * 没法下推给数据库排序，只能在内存里排；这里给一个防御性上限，
 * 超出时通过 truncated 告诉调用方「还有更多，但没全部加载」。
 * 家庭账本的实际规模通常在几百人，2000 足够用。
 */
const MAX_CONTACTS_SCAN = 2000;

function duplicateNameError() {
  return new AppError("CONTACT_NAME_DUPLICATE");
}

/** Prisma 的 @default(cuid()) 是客户端生成，数据库没有默认值，插入时需显式给 id */
function newId(): string {
  return crypto.randomUUID();
}

async function assertNameAvailable(
  ledgerId: string,
  name: string,
  excludeContactId?: string,
): Promise<void> {
  const conditions = [eq(contact.ledgerId, ledgerId), eq(contact.name, name), isNull(contact.deletedAt)];
  if (excludeContactId) conditions.push(ne(contact.id, excludeContactId));

  const existing = await db
    .select({ id: contact.id })
    .from(contact)
    .where(and(...conditions))
    .limit(1);
  if (existing.length > 0) throw duplicateNameError();
}

export async function listContacts(
  ctx: LedgerContext,
  input: { q?: string; sort: "recent" | "name"; page: number; pageSize: number },
) {
  const conditions = [eq(contact.ledgerId, ctx.ledgerId), isNull(contact.deletedAt)];
  if (input.q) conditions.push(ilike(contact.name, `%${input.q}%`));
  const where = and(...conditions);

  // 排序依赖 stats（最近往来时间），无法在数据库层完成，先取一批再内存排序分页。
  // total 用独立的 count 拿真实值，避免扫描上限把「共多少位」也一起截断。
  const [totalRows, rows] = await Promise.all([
    db.select({ n: count() }).from(contact).where(where),
    db.select().from(contact).where(where).limit(MAX_CONTACTS_SCAN),
  ]);
  const total = Number(totalRows[0]?.n ?? 0);

  const statsMap = await contactStatsMap(
    ctx.ledgerId,
    rows.map((row) => row.id),
  );

  const items: ContactDto[] = rows.map((row) =>
    contactToDto(row, statsMap.get(row.id) ?? emptyContactStats()),
  );

  items.sort((a, b) => {
    if (input.sort === "name") return a.name.localeCompare(b.name, "zh-Hans-CN");
    const diff = (b.stats.lastRecordAt ?? "").localeCompare(a.stats.lastRecordAt ?? "");
    return diff !== 0 ? diff : a.name.localeCompare(b.name, "zh-Hans-CN");
  });

  const start = (input.page - 1) * input.pageSize;
  return {
    items: items.slice(start, start + input.pageSize),
    total,
    truncated: total > rows.length,
  };
}

export async function getContact(ctx: LedgerContext, contactId: string): Promise<ContactDto> {
  const rows = await db
    .select()
    .from(contact)
    .where(
      and(eq(contact.id, contactId), eq(contact.ledgerId, ctx.ledgerId), isNull(contact.deletedAt)),
    )
    .limit(1);
  const row = rows[0];
  if (!row) throw new AppError("NOT_FOUND");

  const statsMap = await contactStatsMap(ctx.ledgerId, [row.id]);
  return contactToDto(row, statsMap.get(row.id) ?? emptyContactStats());
}

export async function createContact(
  ctx: LedgerContext,
  input: CreateContactInput,
): Promise<ContactDto> {
  await assertNameAvailable(ctx.ledgerId, input.name);

  try {
    const inserted = await db
      .insert(contact)
      .values({
        id: newId(),
        ledgerId: ctx.ledgerId,
        name: input.name,
        relationTag: input.relationTag ?? null,
        phone: input.phone ?? null,
        note: input.note ?? null,
      })
      .returning();
    return contactToDto(inserted[0], emptyContactStats());
  } catch (error) {
    // 并发下部分唯一索引兜底
    if (isUniqueConstraintError(error)) throw duplicateNameError();
    throw error;
  }
}

export async function updateContact(
  ctx: LedgerContext,
  contactId: string,
  input: UpdateContactInput,
): Promise<ContactDto> {
  const existing = await db
    .select({ id: contact.id })
    .from(contact)
    .where(
      and(eq(contact.id, contactId), eq(contact.ledgerId, ctx.ledgerId), isNull(contact.deletedAt)),
    )
    .limit(1);
  if (existing.length === 0) throw new AppError("NOT_FOUND");

  if (input.name !== undefined) {
    await assertNameAvailable(ctx.ledgerId, input.name, contactId);
  }

  try {
    const updated = await db
      .update(contact)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.relationTag !== undefined ? { relationTag: input.relationTag } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
        updatedAt: new Date(),
      })
      .where(eq(contact.id, contactId))
      .returning();

    const row = updated[0];
    const statsMap = await contactStatsMap(ctx.ledgerId, [row.id]);
    return contactToDto(row, statsMap.get(row.id) ?? emptyContactStats());
  } catch (error) {
    if (isUniqueConstraintError(error)) throw duplicateNameError();
    throw error;
  }
}

/** 软删除联系人：其礼金记录全部保留，仍计入账本统计与按人对账 */
export async function deleteContact(ctx: LedgerContext, contactId: string) {
  const existing = await db
    .select({ id: contact.id })
    .from(contact)
    .where(
      and(eq(contact.id, contactId), eq(contact.ledgerId, ctx.ledgerId), isNull(contact.deletedAt)),
    )
    .limit(1);
  if (existing.length === 0) throw new AppError("NOT_FOUND");

  // 同一事务里完成软删与计数，避免读到中间状态
  const counted = await db.transaction(async (tx) => {
    await tx
      .update(contact)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(contact.id, contactId));
    return tx
      .select({ n: count() })
      .from(record)
      .where(
        and(eq(record.ledgerId, ctx.ledgerId), eq(record.contactId, contactId), isNull(record.deletedAt)),
      );
  });

  return { deleted: true, recordCount: Number(counted[0]?.n ?? 0) };
}
