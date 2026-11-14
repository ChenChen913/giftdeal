/**
 * 演示数据 seed。
 *
 * 特性：
 * - 固定 ID，前端可直接硬编码调试
 * - 幂等：全部 upsert，可重复执行
 * - --reset：先清掉所有 demo 数据再重建
 *
 * 用法：
 *   npx prisma db seed
 *   npx prisma db seed -- --reset
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "better-auth/crypto";
import "dotenv/config";

import { PrismaClient } from "../src/generated/prisma/client.js";

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("缺少 DIRECT_URL / DATABASE_URL");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString, max: 2, connectionTimeoutMillis: 10_000 }),
});

const DAY = 86_400_000;
const now = new Date();

// ------------------------------------------------------------
// 数据定义
// ------------------------------------------------------------

const USERS = [
  {
    id: "usr_demo_a",
    name: "张伟",
    phoneNumber: "+8613800000001",
    email: "8613800000001@phone.local",
    defaultLedgerId: "led_zhang",
  },
  {
    id: "usr_demo_b",
    name: "李娜",
    phoneNumber: "+8613800000002",
    email: "8613800000002@phone.local",
    defaultLedgerId: "led_li",
  },
];

/** 内部账号：登录框填 admin 即可（密码只在服务端使用） */
const ADMIN = {
  id: "usr_admin",
  name: "管理员",
  email: "admin@giftdeal.local",
  phoneNumber: "+8613800000000",
  password: process.env.ADMIN_LOGIN_PASSWORD ?? "123456",
  defaultLedgerId: "led_zhang",
};

const LEDGERS = [
  { id: "led_zhang", name: "张家礼金账" },
  { id: "led_li", name: "李家礼金账" },
];

const MEMBERSHIPS = [
  { id: "mem_zhang_a", ledgerId: "led_zhang", userId: "usr_demo_a", role: "OWNER" as const },
  { id: "mem_zhang_b", ledgerId: "led_zhang", userId: "usr_demo_b", role: "MEMBER" as const },
  { id: "mem_li_b", ledgerId: "led_li", userId: "usr_demo_b", role: "OWNER" as const },
  { id: "mem_li_a", ledgerId: "led_li", userId: "usr_demo_a", role: "MEMBER" as const },
];

const CONTACTS = [
  { id: "con_a_001", ledgerId: "led_zhang", name: "王建国", relationTag: "亲戚", note: "二舅" },
  { id: "con_a_002", ledgerId: "led_zhang", name: "刘芳", relationTag: "亲戚" },
  { id: "con_a_003", ledgerId: "led_zhang", name: "陈晓明", relationTag: "同事" },
  { id: "con_a_004", ledgerId: "led_zhang", name: "赵磊", relationTag: "同学" },
  { id: "con_a_005", ledgerId: "led_zhang", name: "孙阿姨", relationTag: "邻居" },
  { id: "con_a_006", ledgerId: "led_zhang", name: "周敏", relationTag: "朋友" },
  { id: "con_a_007", ledgerId: "led_zhang", name: "吴强", relationTag: "同事", note: "暂无往来" },
  { id: "con_b_001", ledgerId: "led_li", name: "李国强", relationTag: "亲戚" },
  { id: "con_b_002", ledgerId: "led_li", name: "郑爽", relationTag: "朋友" },
  { id: "con_b_003", ledgerId: "led_li", name: "马超", relationTag: "同事" },
  { id: "con_b_004", ledgerId: "led_li", name: "何静", relationTag: "同学" },
  { id: "con_b_005", ledgerId: "led_li", name: "高远", relationTag: "其他" },
];

type SeedRecord = {
  id: string;
  ledgerId: string;
  contactId: string;
  direction: "GIVEN" | "RECEIVED";
  amountCents: number;
  scene: "WEDDING" | "BABY_FULL_MONTH" | "BABY_HUNDRED_DAYS" | "FUNERAL" | "OTHER";
  occurredAt: string;
  note?: string;
  /** 手动结清时间 */
  settledAt?: string;
};

const RECORDS: SeedRecord[] = [
  // ---- 账本 A：张家（送出 4300 元 / 收到 4100 元 / 净差额 -200 元）----
  { id: "rec_a_001", ledgerId: "led_zhang", contactId: "con_a_001", direction: "RECEIVED", amountCents: 80000, scene: "WEDDING", occurredAt: "2025-10-01", note: "建国婚礼" },
  { id: "rec_a_002", ledgerId: "led_zhang", contactId: "con_a_001", direction: "RECEIVED", amountCents: 50000, scene: "BABY_FULL_MONTH", occurredAt: "2026-03-08" },
  { id: "rec_a_003", ledgerId: "led_zhang", contactId: "con_a_002", direction: "RECEIVED", amountCents: 100000, scene: "WEDDING", occurredAt: "2025-05-20" },
  { id: "rec_a_004", ledgerId: "led_zhang", contactId: "con_a_002", direction: "GIVEN", amountCents: 60000, scene: "FUNERAL", occurredAt: "2025-12-11" },
  { id: "rec_a_005", ledgerId: "led_zhang", contactId: "con_a_003", direction: "GIVEN", amountCents: 50000, scene: "WEDDING", occurredAt: "2026-02-14" },
  { id: "rec_a_006", ledgerId: "led_zhang", contactId: "con_a_003", direction: "RECEIVED", amountCents: 30000, scene: "BABY_FULL_MONTH", occurredAt: "2026-06-18", settledAt: "2026-06-20T02:00:00.000Z" },
  { id: "rec_a_007", ledgerId: "led_zhang", contactId: "con_a_004", direction: "GIVEN", amountCents: 120000, scene: "WEDDING", occurredAt: "2025-09-09" },
  { id: "rec_a_008", ledgerId: "led_zhang", contactId: "con_a_004", direction: "RECEIVED", amountCents: 80000, scene: "BABY_HUNDRED_DAYS", occurredAt: "2026-04-02" },
  { id: "rec_a_009", ledgerId: "led_zhang", contactId: "con_a_005", direction: "RECEIVED", amountCents: 20000, scene: "FUNERAL", occurredAt: "2025-08-08" },
  { id: "rec_a_010", ledgerId: "led_zhang", contactId: "con_a_005", direction: "GIVEN", amountCents: 20000, scene: "BABY_FULL_MONTH", occurredAt: "2026-01-20" },
  { id: "rec_a_011", ledgerId: "led_zhang", contactId: "con_a_006", direction: "GIVEN", amountCents: 60000, scene: "WEDDING", occurredAt: "2026-05-01" },
  { id: "rec_a_012", ledgerId: "led_zhang", contactId: "con_a_006", direction: "RECEIVED", amountCents: 50000, scene: "OTHER", occurredAt: "2026-07-07" },
  { id: "rec_a_013", ledgerId: "led_zhang", contactId: "con_a_001", direction: "GIVEN", amountCents: 80000, scene: "WEDDING", occurredAt: "2026-01-15", note: "回礼" },
  { id: "rec_a_014", ledgerId: "led_zhang", contactId: "con_a_002", direction: "GIVEN", amountCents: 40000, scene: "BABY_FULL_MONTH", occurredAt: "2026-08-16" },

  // ---- 账本 B：李家（送出 3400 元 / 收到 4400 元 / 净差额 +1000 元）----
  { id: "rec_b_001", ledgerId: "led_li", contactId: "con_b_001", direction: "RECEIVED", amountCents: 200000, scene: "WEDDING", occurredAt: "2025-06-06" },
  { id: "rec_b_002", ledgerId: "led_li", contactId: "con_b_001", direction: "GIVEN", amountCents: 120000, scene: "BABY_FULL_MONTH", occurredAt: "2026-02-02" },
  { id: "rec_b_003", ledgerId: "led_li", contactId: "con_b_002", direction: "GIVEN", amountCents: 80000, scene: "WEDDING", occurredAt: "2025-11-11" },
  { id: "rec_b_004", ledgerId: "led_li", contactId: "con_b_002", direction: "RECEIVED", amountCents: 60000, scene: "BABY_FULL_MONTH", occurredAt: "2026-03-03" },
  { id: "rec_b_005", ledgerId: "led_li", contactId: "con_b_002", direction: "GIVEN", amountCents: 60000, scene: "WEDDING", occurredAt: "2026-09-09" },
  { id: "rec_b_006", ledgerId: "led_li", contactId: "con_b_003", direction: "GIVEN", amountCents: 50000, scene: "FUNERAL", occurredAt: "2025-07-07" },
  { id: "rec_b_007", ledgerId: "led_li", contactId: "con_b_003", direction: "RECEIVED", amountCents: 50000, scene: "WEDDING", occurredAt: "2026-06-06" },
  { id: "rec_b_008", ledgerId: "led_li", contactId: "con_b_004", direction: "RECEIVED", amountCents: 100000, scene: "BABY_HUNDRED_DAYS", occurredAt: "2025-12-12" },
  { id: "rec_b_009", ledgerId: "led_li", contactId: "con_b_005", direction: "GIVEN", amountCents: 30000, scene: "OTHER", occurredAt: "2026-04-04" },
  { id: "rec_b_010", ledgerId: "led_li", contactId: "con_b_005", direction: "RECEIVED", amountCents: 30000, scene: "WEDDING", occurredAt: "2026-05-05", settledAt: "2026-05-06T02:00:00.000Z" },
];

/** 关联结清：receivingId 由 givingId 结清 */
const SETTLEMENTS = [
  { receivedId: "rec_a_001", givenId: "rec_a_013", settledAt: "2026-01-15T02:00:00.000Z" },
  { receivedId: "rec_b_004", givenId: "rec_b_005", settledAt: "2026-09-09T02:00:00.000Z" },
];

type SeedPlan = {
  id: string;
  ledgerId: string;
  contactId: string;
  scene: "WEDDING" | "BABY_FULL_MONTH" | "BABY_HUNDRED_DAYS" | "FUNERAL" | "OTHER";
  plannedCents: number;
  expectedAt: string;
  note: string;
};

/** 人情预备：已知未来要办的事，提前备好礼金 */
const PLANS: SeedPlan[] = [
  { id: "plan_a_001", ledgerId: "led_zhang", contactId: "con_a_006", scene: "WEDDING", plannedCents: 80000, expectedAt: "2026-11-28", note: "儿子婚宴" },
  { id: "plan_a_002", ledgerId: "led_zhang", contactId: "con_a_001", scene: "BABY_FULL_MONTH", plannedCents: 60000, expectedAt: "2027-01-10", note: "二胎满月酒" },
  { id: "plan_a_003", ledgerId: "led_zhang", contactId: "con_a_004", scene: "WEDDING", plannedCents: 120000, expectedAt: "2027-05-01", note: "五一婚礼" },
];

const INVITES = [
  {
    id: "inv_demo_pending",
    ledgerId: "led_zhang",
    token: "invite_demo_pending_0000000000000001",
    createdById: "usr_demo_a",
    expiresAt: new Date(now.getTime() + 7 * DAY),
  },
  {
    id: "inv_demo_expired",
    ledgerId: "led_li",
    token: "invite_demo_expired_0000000000000002",
    createdById: "usr_demo_b",
    expiresAt: new Date(now.getTime() - 1 * DAY),
  },
];

// ------------------------------------------------------------
// 执行
// ------------------------------------------------------------

function toDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/**
 * --reset 是破坏性操作：清空库内全部业务数据后重建演示数据。
 * 不能只按固定 ID 前缀清，否则冒烟测试 / 手工试用产生的 cuid 记录会残留，
 * 账本成员数、统计数字会越跑越脏。按外键依赖顺序逐表清空。
 */
async function reset() {
  console.log("重置：清空全部业务数据…");

  // 1. 先断开 User.defaultLedgerId 的自引用，否则删账本会触发外键约束
  await prisma.user.updateMany({ data: { defaultLedgerId: null } });

  // 2. 子表优先：预备 → 记录 → 邀请 / 成员 / 联系人 → 账本
  await prisma.giftPlan.deleteMany({});
  await prisma.record.deleteMany({});
  await prisma.invite.deleteMany({});
  await prisma.membership.deleteMany({});
  await prisma.contact.deleteMany({});
  await prisma.ledger.deleteMany({});

  // 3. Better Auth 的会话 / 凭据 / 验证码，随后删用户
  await prisma.session.deleteMany({});
  await prisma.account.deleteMany({});
  await prisma.verification.deleteMany({});
  await prisma.user.deleteMany({});
}

async function seedAdmin() {
  const passwordHash = await hashPassword(ADMIN.password);

  await prisma.user.upsert({
    where: { id: ADMIN.id },
    create: {
      id: ADMIN.id,
      name: ADMIN.name,
      email: ADMIN.email,
      emailVerified: true,
      phoneNumber: ADMIN.phoneNumber,
      phoneNumberVerified: true,
      defaultLedgerId: ADMIN.defaultLedgerId,
    },
    update: {
      name: ADMIN.name,
      email: ADMIN.email,
      defaultLedgerId: ADMIN.defaultLedgerId,
    },
  });

  const existing = await prisma.account.findFirst({
    where: { userId: ADMIN.id, providerId: "credential" },
    select: { id: true },
  });

  if (existing) {
    await prisma.account.update({
      where: { id: existing.id },
      data: { password: passwordHash },
    });
  } else {
    await prisma.account.create({
      data: {
        id: "acc_admin_credential",
        accountId: ADMIN.id,
        providerId: "credential",
        userId: ADMIN.id,
        password: passwordHash,
      },
    });
  }

  // 管理员同时是两本演示账本的成员，登录后可直接看到数据
  for (const ledgerId of ["led_zhang", "led_li"]) {
    await prisma.membership.upsert({
      where: { id: `mem_${ledgerId}_admin` },
      create: {
        id: `mem_${ledgerId}_admin`,
        ledgerId,
        userId: ADMIN.id,
        role: "MEMBER",
      },
      update: {},
    });
  }
}

async function seed() {
  for (const user of USERS) {
    await prisma.user.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: false,
        phoneNumber: user.phoneNumber,
        phoneNumberVerified: true,
      },
      update: {
        name: user.name,
        phoneNumber: user.phoneNumber,
        phoneNumberVerified: true,
      },
    });
  }

  for (const ledger of LEDGERS) {
    await prisma.ledger.upsert({
      where: { id: ledger.id },
      create: { id: ledger.id, name: ledger.name },
      update: { name: ledger.name },
    });
  }

  for (const membership of MEMBERSHIPS) {
    await prisma.membership.upsert({
      where: { id: membership.id },
      create: membership,
      update: { role: membership.role },
    });
  }

  for (const contact of CONTACTS) {
    await prisma.contact.upsert({
      where: { id: contact.id },
      create: {
        id: contact.id,
        ledgerId: contact.ledgerId,
        name: contact.name,
        relationTag: contact.relationTag ?? null,
        note: contact.note ?? null,
        deletedAt: null,
      },
      update: {
        name: contact.name,
        relationTag: contact.relationTag ?? null,
        note: contact.note ?? null,
        deletedAt: null,
      },
    });
  }

  // 第一遍：只写记录本身，不带结清外键（避免引用尚未写入的行）
  for (const record of RECORDS) {
    await prisma.record.upsert({
      where: { id: record.id },
      create: {
        id: record.id,
        ledgerId: record.ledgerId,
        contactId: record.contactId,
        direction: record.direction,
        amountCents: record.amountCents,
        scene: record.scene,
        occurredAt: toDate(record.occurredAt),
        note: record.note ?? null,
        settledAt: record.settledAt ? new Date(record.settledAt) : null,
        createdById: record.ledgerId === "led_zhang" ? "usr_demo_a" : "usr_demo_b",
      },
      update: {
        contactId: record.contactId,
        direction: record.direction,
        amountCents: record.amountCents,
        scene: record.scene,
        occurredAt: toDate(record.occurredAt),
        note: record.note ?? null,
        settledAt: record.settledAt ? new Date(record.settledAt) : null,
        deletedAt: null,
        settledByRecordId: null,
      },
    });
  }

  // 第二遍：建立关联结清（外键在「收到」记录上）
  for (const settlement of SETTLEMENTS) {
    await prisma.record.update({
      where: { id: settlement.receivedId },
      data: {
        settledAt: new Date(settlement.settledAt),
        settledByRecordId: settlement.givenId,
      },
    });
  }

  for (const plan of PLANS) {
    await prisma.giftPlan.upsert({
      where: { id: plan.id },
      create: {
        id: plan.id,
        ledgerId: plan.ledgerId,
        contactId: plan.contactId,
        direction: "GIVEN",
        scene: plan.scene,
        plannedCents: plan.plannedCents,
        expectedAt: toDate(plan.expectedAt),
        note: plan.note,
        status: "PLANNED",
        createdById: "usr_demo_a",
      },
      update: {
        contactId: plan.contactId,
        scene: plan.scene,
        plannedCents: plan.plannedCents,
        expectedAt: toDate(plan.expectedAt),
        note: plan.note,
        status: "PLANNED",
        completedAt: null,
        recordId: null,
        deletedAt: null,
      },
    });
  }

  for (const invite of INVITES) {
    await prisma.invite.upsert({
      where: { id: invite.id },
      create: invite,
      update: { expiresAt: invite.expiresAt },
    });
  }

  // 默认账本（放在账本创建之后，避免外键顺序问题）
  for (const user of USERS) {
    await prisma.user.update({
      where: { id: user.id },
      data: { defaultLedgerId: user.defaultLedgerId },
    });
  }
}

async function report() {
  for (const ledger of LEDGERS) {
    const [given, received, pending, contacts] = await Promise.all([
      prisma.record.aggregate({
        where: { ledgerId: ledger.id, direction: "GIVEN", deletedAt: null },
        _sum: { amountCents: true },
      }),
      prisma.record.aggregate({
        where: { ledgerId: ledger.id, direction: "RECEIVED", deletedAt: null },
        _sum: { amountCents: true },
      }),
      prisma.record.aggregate({
        where: {
          ledgerId: ledger.id,
          direction: "RECEIVED",
          settledAt: null,
          deletedAt: null,
        },
        _sum: { amountCents: true },
        _count: { _all: true },
      }),
      prisma.contact.count({ where: { ledgerId: ledger.id, deletedAt: null } }),
    ]);

    const givenTotal = given._sum.amountCents ?? 0;
    const receivedTotal = received._sum.amountCents ?? 0;

    console.log(
      [
        `账本 ${ledger.name} (${ledger.id})`,
        `  联系人 ${contacts}`,
        `  送出 ${(givenTotal / 100).toFixed(2)} 元`,
        `  收到 ${(receivedTotal / 100).toFixed(2)} 元`,
        `  净差额 ${((receivedTotal - givenTotal) / 100).toFixed(2)} 元`,
        `  待回礼 ${pending._count._all} 笔 / ${((pending._sum.amountCents ?? 0) / 100).toFixed(2)} 元`,
      ].join("\n"),
    );
  }
}

async function main() {
  const shouldReset = process.argv.includes("--reset");

  /**
   * 生产环境保护：seed 会写入演示数据，--reset 还会物理清空全部业务数据
   * （软删除也救不回来）。默认拒绝，确实需要时显式设置 ALLOW_SEED=true。
   */
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_SEED !== "true") {
    throw new Error(
      "拒绝在 production 环境执行 seed：会写入演示数据" +
        (shouldReset ? "，且 --reset 会清空全部业务数据" : "") +
        "。确实需要请显式设置 ALLOW_SEED=true。",
    );
  }

  if (shouldReset) await reset();

  // 必须先建账本再挂 admin：admin 的 defaultLedgerId 是外键，
  // --reset 删掉账本后若先跑 seedAdmin 会触发 user_default_ledger_id_fkey。
  await seed();
  await seedAdmin();
  console.log("\nSeed 完成：\n");
  await report();

  if (process.env.NODE_ENV !== "production") {
    console.log("\n登录方式一（手机验证码）：+8613800000001 / 123456");
    console.log("登录方式二（内部快捷）：手机号框填 admin，无需验证码");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
