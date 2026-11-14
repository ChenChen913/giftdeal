import { AppError, isUniqueConstraintError } from "@/server/http/errors";
import {
  contactToDto,
  emptyContactStats,
  type ContactDto,
} from "@/server/mappers/contact.mapper";
import { prisma } from "@/server/db";
import type { LedgerContext } from "@/server/guards/ledger";
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

async function assertNameAvailable(
  ledgerId: string,
  name: string,
  excludeContactId?: string,
): Promise<void> {
  const existing = await prisma.contact.findFirst({
    where: {
      ledgerId,
      name,
      deletedAt: null,
      ...(excludeContactId ? { id: { not: excludeContactId } } : {}),
    },
    select: { id: true },
  });
  if (existing) throw duplicateNameError();
}

export async function listContacts(
  ctx: LedgerContext,
  input: { q?: string; sort: "recent" | "name"; page: number; pageSize: number },
) {
  const where = {
    ledgerId: ctx.ledgerId,
    deletedAt: null,
    ...(input.q ? { name: { contains: input.q, mode: "insensitive" as const } } : {}),
  };

  // 排序依赖 stats（最近往来时间），无法在数据库层完成，先取一批再内存排序分页。
  // total 用独立的 count 拿真实值，避免扫描上限把「共多少位」也一起截断。
  const [total, rows] = await Promise.all([
    prisma.contact.count({ where }),
    prisma.contact.findMany({ where, take: MAX_CONTACTS_SCAN }),
  ]);
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
  const row = await prisma.contact.findFirst({
    where: { id: contactId, ledgerId: ctx.ledgerId, deletedAt: null },
  });
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
    const row = await prisma.contact.create({
      data: {
        ledgerId: ctx.ledgerId,
        name: input.name,
        relationTag: input.relationTag ?? null,
        phone: input.phone ?? null,
        note: input.note ?? null,
      },
    });
    return contactToDto(row, emptyContactStats());
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
  const existing = await prisma.contact.findFirst({
    where: { id: contactId, ledgerId: ctx.ledgerId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw new AppError("NOT_FOUND");

  if (input.name !== undefined) {
    await assertNameAvailable(ctx.ledgerId, input.name, contactId);
  }

  try {
    const row = await prisma.contact.update({
      where: { id: contactId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.relationTag !== undefined ? { relationTag: input.relationTag } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
      },
    });

    const statsMap = await contactStatsMap(ctx.ledgerId, [row.id]);
    return contactToDto(row, statsMap.get(row.id) ?? emptyContactStats());
  } catch (error) {
    if (isUniqueConstraintError(error)) throw duplicateNameError();
    throw error;
  }
}

/** 软删除联系人：其礼金记录全部保留，仍计入账本统计与按人对账 */
export async function deleteContact(ctx: LedgerContext, contactId: string) {
  const existing = await prisma.contact.findFirst({
    where: { id: contactId, ledgerId: ctx.ledgerId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw new AppError("NOT_FOUND");

  const [, recordCount] = await prisma.$transaction([
    prisma.contact.update({
      where: { id: contactId },
      data: { deletedAt: new Date() },
    }),
    prisma.record.count({
      where: { ledgerId: ctx.ledgerId, contactId, deletedAt: null },
    }),
  ]);

  return { deleted: true, recordCount };
}
