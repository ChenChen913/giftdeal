import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Drizzle schema —— 与 prisma/migrations 下的实际表结构一一对应。
 *
 * 换掉 Prisma 的原因：Prisma 7 的查询编译器是 WASM，必须通过
 * `import("./x.wasm?module")` 静态导入；而 Next.js 的 webpack 必然拦截
 * 这个后缀，Cloudflare Workers 又禁止运行时编译 WASM。三者无法同时满足。
 * Drizzle 是纯 TS，没有 WASM，Workers 原生可用。
 *
 * 约定与 Prisma 保持一致：
 * - 金额一律「分」为单位的整数
 * - 时间戳 precision = 3（毫秒），与 TIMESTAMP(3) 对齐
 * - occurredAt / expectedAt 是 DATE，只表达自然日
 */

export const recordDirectionEnum = pgEnum("record_direction", ["GIVEN", "RECEIVED"]);
export const giftSceneEnum = pgEnum("gift_scene", [
  "WEDDING",
  "BABY_FULL_MONTH",
  "BABY_HUNDRED_DAYS",
  "FUNERAL",
  "OTHER",
]);
export const membershipRoleEnum = pgEnum("membership_role", ["OWNER", "MEMBER"]);
export const planStatusEnum = pgEnum("plan_status", ["PLANNED", "DONE"]);

const createdAt = timestamp("created_at", { precision: 3 }).notNull().defaultNow();
const updatedAt = timestamp("updated_at", { precision: 3 })
  .notNull()
  .defaultNow()
  .$onUpdate(() => new Date());

export const ledger = pgTable("ledger", {
  id: text("id").primaryKey(),
  name: varchar("name", { length: 50 }).notNull(),
  createdAt,
  updatedAt,
});

export const user = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    phoneNumber: text("phone_number").notNull(),
    phoneNumberVerified: boolean("phone_number_verified").notNull().default(false),
    wxOpenId: text("wx_open_id"),
    defaultLedgerId: text("default_ledger_id").references(() => ledger.id, {
      onDelete: "set null",
    }),
    createdAt,
    updatedAt,
  },
  (t) => [
    uniqueIndex("user_email_key").on(t.email),
    uniqueIndex("user_phone_number_key").on(t.phoneNumber),
    uniqueIndex("user_wx_open_id_key").on(t.wxOpenId),
  ],
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { precision: 3 }).notNull(),
    token: text("token").notNull(),
    createdAt,
    updatedAt,
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("session_token_key").on(t.token), index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { precision: 3 }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { precision: 3 }),
    scope: text("scope"),
    password: text("password"),
    createdAt,
    updatedAt,
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { precision: 3 }).notNull(),
    createdAt,
    updatedAt,
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

export const membership = pgTable(
  "membership",
  {
    id: text("id").primaryKey(),
    ledgerId: text("ledger_id")
      .notNull()
      .references(() => ledger.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: membershipRoleEnum("role").notNull().default("MEMBER"),
    joinedAt: timestamp("joined_at", { precision: 3 }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("membership_ledger_id_user_id_key").on(t.ledgerId, t.userId),
    index("membership_user_id_idx").on(t.userId),
  ],
);

export const contact = pgTable(
  "contact",
  {
    id: text("id").primaryKey(),
    ledgerId: text("ledger_id")
      .notNull()
      .references(() => ledger.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 30 }).notNull(),
    relationTag: varchar("relation_tag", { length: 20 }),
    phone: varchar("phone", { length: 20 }),
    note: varchar("note", { length: 200 }),
    deletedAt: timestamp("deleted_at", { precision: 3 }),
    createdAt,
    updatedAt,
  },
  (t) => [
    index("contact_ledger_id_deleted_at_idx").on(t.ledgerId, t.deletedAt),
    index("contact_ledger_id_name_idx").on(t.ledgerId, t.name),
  ],
);

export const lifeEvent = pgTable(
  "life_event",
  {
    id: text("id").primaryKey(),
    ledgerId: text("ledger_id")
      .notNull()
      .references(() => ledger.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 50 }).notNull(),
    scene: giftSceneEnum("scene").notNull().default("OTHER"),
    occurredAt: date("occurred_at", { mode: "date" }).notNull(),
    location: varchar("location", { length: 100 }),
    note: varchar("note", { length: 200 }),
    hosted: boolean("hosted").notNull().default(true),
    deletedAt: timestamp("deleted_at", { precision: 3 }),
    createdAt,
    updatedAt,
  },
  (t) => [
    index("life_event_ledger_id_occurred_at_idx").on(t.ledgerId, t.occurredAt),
    index("life_event_ledger_id_deleted_at_idx").on(t.ledgerId, t.deletedAt),
  ],
);

export const record = pgTable(
  "record",
  {
    id: text("id").primaryKey(),
    ledgerId: text("ledger_id")
      .notNull()
      .references(() => ledger.id, { onDelete: "cascade" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "cascade" }),
    direction: recordDirectionEnum("direction").notNull(),
    amountCents: integer("amount_cents").notNull(),
    scene: giftSceneEnum("scene").notNull().default("OTHER"),
    occurredAt: date("occurred_at", { mode: "date" }).notNull(),
    note: varchar("note", { length: 200 }),
    settledAt: timestamp("settled_at", { precision: 3 }),
    settledByRecordId: text("settled_by_record_id"),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    eventId: text("event_id").references(() => lifeEvent.id, { onDelete: "set null" }),
    deletedAt: timestamp("deleted_at", { precision: 3 }),
    createdAt,
    updatedAt,
  },
  (t) => [
    uniqueIndex("record_settled_by_record_id_key").on(t.settledByRecordId),
    index("record_ledger_id_contact_id_occurred_at_idx").on(t.ledgerId, t.contactId, t.occurredAt),
    index("record_ledger_id_direction_settled_at_idx").on(t.ledgerId, t.direction, t.settledAt),
    index("record_ledger_id_occurred_at_idx").on(t.ledgerId, t.occurredAt),
    index("record_ledger_id_deleted_at_idx").on(t.ledgerId, t.deletedAt),
    index("record_ledger_id_event_id_idx").on(t.ledgerId, t.eventId),
  ],
);

export const invite = pgTable(
  "invite",
  {
    id: text("id").primaryKey(),
    ledgerId: text("ledger_id")
      .notNull()
      .references(() => ledger.id, { onDelete: "cascade" }),
    token: varchar("token", { length: 64 }).notNull(),
    createdById: text("created_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { precision: 3 }).notNull(),
    usedAt: timestamp("used_at", { precision: 3 }),
    usedByUserId: text("used_by_user_id").references(() => user.id, { onDelete: "set null" }),
    revokedAt: timestamp("revoked_at", { precision: 3 }),
    createdAt,
  },
  (t) => [
    uniqueIndex("invite_token_key").on(t.token),
    index("invite_ledger_id_created_at_idx").on(t.ledgerId, t.createdAt),
  ],
);

export const giftPlan = pgTable(
  "gift_plan",
  {
    id: text("id").primaryKey(),
    ledgerId: text("ledger_id")
      .notNull()
      .references(() => ledger.id, { onDelete: "cascade" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "cascade" }),
    direction: recordDirectionEnum("direction").notNull().default("GIVEN"),
    scene: giftSceneEnum("scene").notNull().default("OTHER"),
    plannedCents: integer("planned_cents").notNull(),
    expectedAt: date("expected_at", { mode: "date" }).notNull(),
    status: planStatusEnum("status").notNull().default("PLANNED"),
    note: varchar("note", { length: 200 }),
    recordId: text("record_id").references(() => record.id, { onDelete: "set null" }),
    completedAt: timestamp("completed_at", { precision: 3 }),
    createdById: text("created_by_id").references(() => user.id, { onDelete: "set null" }),
    deletedAt: timestamp("deleted_at", { precision: 3 }),
    createdAt,
    updatedAt,
  },
  (t) => [
    uniqueIndex("gift_plan_record_id_key").on(t.recordId),
    index("gift_plan_ledger_id_status_expected_at_idx").on(t.ledgerId, t.status, t.expectedAt),
    index("gift_plan_ledger_id_contact_id_idx").on(t.ledgerId, t.contactId),
    index("gift_plan_ledger_id_deleted_at_idx").on(t.ledgerId, t.deletedAt),
  ],
);

// ------------------------------------------------------------
// 关系（只用于 query API 的 with/join，不生成 DDL）
// ------------------------------------------------------------

export const ledgerRelations = relations(ledger, ({ many }) => ({
  memberships: many(membership),
  contacts: many(contact),
  records: many(record),
  invites: many(invite),
  plans: many(giftPlan),
  events: many(lifeEvent),
}));

export const userRelations = relations(user, ({ one, many }) => ({
  defaultLedger: one(ledger, { fields: [user.defaultLedgerId], references: [ledger.id] }),
  sessions: many(session),
  accounts: many(account),
  memberships: many(membership),
}));

export const membershipRelations = relations(membership, ({ one }) => ({
  ledger: one(ledger, { fields: [membership.ledgerId], references: [ledger.id] }),
  user: one(user, { fields: [membership.userId], references: [user.id] }),
}));

export const contactRelations = relations(contact, ({ one, many }) => ({
  ledger: one(ledger, { fields: [contact.ledgerId], references: [ledger.id] }),
  records: many(record),
  plans: many(giftPlan),
}));

export const recordRelations = relations(record, ({ one }) => ({
  ledger: one(ledger, { fields: [record.ledgerId], references: [ledger.id] }),
  contact: one(contact, { fields: [record.contactId], references: [contact.id] }),
  createdBy: one(user, { fields: [record.createdById], references: [user.id] }),
  event: one(lifeEvent, { fields: [record.eventId], references: [lifeEvent.id] }),
  /**
   * 自关联：本记录（送出）结清了哪条收到记录。
   * settled_by_record_id 有唯一约束，所以是一对一。
   * 自关联必须显式给 relationName，否则 Drizzle 无法区分方向。
   */
  settledRecord: one(record, {
    fields: [record.settledByRecordId],
    references: [record.id],
    relationName: "RecordSettlement",
  }),
}));

export const inviteRelations = relations(invite, ({ one }) => ({
  ledger: one(ledger, { fields: [invite.ledgerId], references: [ledger.id] }),
  createdBy: one(user, { fields: [invite.createdById], references: [user.id] }),
  usedBy: one(user, { fields: [invite.usedByUserId], references: [user.id] }),
}));

export const giftPlanRelations = relations(giftPlan, ({ one }) => ({
  ledger: one(ledger, { fields: [giftPlan.ledgerId], references: [ledger.id] }),
  contact: one(contact, { fields: [giftPlan.contactId], references: [contact.id] }),
  record: one(record, { fields: [giftPlan.recordId], references: [record.id] }),
  createdBy: one(user, { fields: [giftPlan.createdById], references: [user.id] }),
}));

export const lifeEventRelations = relations(lifeEvent, ({ one, many }) => ({
  ledger: one(ledger, { fields: [lifeEvent.ledgerId], references: [ledger.id] }),
  records: many(record),
}));

export type ContactRow = typeof contact.$inferSelect;
export type RecordRow = typeof record.$inferSelect;
export type GiftPlanRow = typeof giftPlan.$inferSelect;
export type LifeEventRow = typeof lifeEvent.$inferSelect;
export type LedgerRow = typeof ledger.$inferSelect;
export type MembershipRow = typeof membership.$inferSelect;
export type UserRow = typeof user.$inferSelect;
export type InviteRow = typeof invite.$inferSelect;
