import assert from "node:assert/strict";
import test from "node:test";

import { AppError } from "@/server/http/errors";
import { startTestDatabase } from "./helpers/test-db";
import { createLedgerFixture, type Db } from "./helpers/fixtures";

const database = await startTestDatabase();
const { db } = (await import("@/server/db-drizzle")) as unknown as { db: Db };
const contactService = await import("@/server/services/contact.service");
const recordService = await import("@/server/services/record.service");
const eventService = await import("@/server/services/event.service");
const planService = await import("@/server/services/plan.service");
const statsService = await import("@/server/services/stats.service");

const recordInput = {
  direction: "RECEIVED" as const,
  amountCents: 60_000,
  scene: "WEDDING" as const,
  occurredAt: "2024-05-01",
};

test.beforeEach(async () => {
  await database.reset();
});

test.after(async () => {
  await database.close();
});

test("软删除联系人：历史礼金完整保留，仍计入账本统计", async () => {
  const { ctx, ledgerId, contactId } = await createLedgerFixture(db);
  const record = await recordService.createRecord(ctx, { ...recordInput, contactId });

  const deleted = await contactService.deleteContact(ctx, contactId);
  assert.equal(deleted.recordCount, 1);

  await assert.rejects(
    () => contactService.getContact(ctx, contactId),
    (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND",
  );

  // 记录还在，明细里仍能读到亲友姓名
  const still = await recordService.getRecord(ctx, record.record.id);
  assert.equal(still.contact.id, contactId);
  assert.equal(still.contact.name, "王建国");

  const overview = await statsService.getOverview(ledgerId);
  assert.equal(overview.recordCount, 1);
  assert.equal(overview.contactCount, 0, "名录里不再显示已删亲友");
  assert.equal(overview.receivedTotalCents, 60_000);

  const list = await contactService.listContacts(ctx, { sort: "recent", page: 1, pageSize: 20 });
  assert.equal(list.items.length, 0);
});

test("已删除联系人不能再新增记录或预备", async () => {
  const { ctx, contactId } = await createLedgerFixture(db);
  await contactService.deleteContact(ctx, contactId);

  await assert.rejects(
    () => recordService.createRecord(ctx, { ...recordInput, contactId }),
    (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND",
  );
  await assert.rejects(
    () =>
      planService.createPlan(ctx, {
        contactId,
        direction: "GIVEN",
        scene: "WEDDING",
        plannedCents: 10_000,
        expectedAt: "2030-01-01",
      }),
    (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND",
  );
});

test("软删除记录后，统计与联系人汇总同步排除", async () => {
  const { ctx, ledgerId, contactId } = await createLedgerFixture(db);
  const first = await recordService.createRecord(ctx, { ...recordInput, contactId });
  await recordService.createRecord(ctx, { ...recordInput, contactId, amountCents: 40_000 });

  await recordService.deleteRecord(ctx, first.record.id);

  const overview = await statsService.getOverview(ledgerId);
  assert.equal(overview.recordCount, 1);
  assert.equal(overview.receivedTotalCents, 40_000);

  const stats = await statsService.contactStatsMap(ledgerId, [contactId]);
  assert.equal(stats.get(contactId)?.recordCount, 1);
  assert.equal(stats.get(contactId)?.receivedTotalCents, 40_000);
});

test("联系人同名冲突：改名重复被拒绝；软删除后可以重建同名", async () => {
  const { ctx, contactId } = await createLedgerFixture(db);

  await assert.rejects(
    () => contactService.createContact(ctx, { name: "王建国" }),
    (error: unknown) => error instanceof AppError && error.code === "CONTACT_NAME_DUPLICATE",
  );

  const second = await contactService.createContact(ctx, { name: "李娜" });
  await assert.rejects(
    () => contactService.updateContact(ctx, second.id, { name: "王建国" }),
    (error: unknown) => error instanceof AppError && error.code === "CONTACT_NAME_DUPLICATE",
  );

  await contactService.deleteContact(ctx, contactId);
  const recreated = await contactService.createContact(ctx, { name: "王建国" });
  assert.equal(recreated.name, "王建国");

  const list = await contactService.listContacts(ctx, { sort: "name", page: 1, pageSize: 20 });
  assert.equal(list.items.length, 2);
});

test("人生大事：记录归类、汇总、删除后解除关联但保留礼金", async () => {
  const { ctx, contactId } = await createLedgerFixture(db);

  const event = await eventService.createEvent(ctx, {
    title: "我的婚礼",
    scene: "WEDDING",
    occurredAt: "2024-05-01",
    hosted: true,
  });

  const received = await recordService.createRecord(ctx, {
    ...recordInput,
    contactId,
    eventId: event.id,
  });
  await recordService.createRecord(ctx, {
    contactId,
    direction: "GIVEN",
    amountCents: 20_000,
    scene: "WEDDING",
    occurredAt: "2024-05-02",
    eventId: event.id,
  });

  const detail = await eventService.getEventDetail(ctx, event.id);
  assert.equal(detail.records.length, 2);
  assert.equal(detail.event.summary.receivedTotalCents, 60_000);
  assert.equal(detail.event.summary.givenTotalCents, 20_000);
  assert.equal(detail.event.summary.netCents, 40_000);
  assert.equal(detail.event.summary.participantCount, 1);

  const deleted = await eventService.deleteEvent(ctx, event.id);
  assert.equal(deleted.detachedRecordCount, 2);

  const recordAfter = await recordService.getRecord(ctx, received.record.id);
  assert.equal(recordAfter.eventId, null);

  await assert.rejects(
    () => eventService.getEventDetail(ctx, event.id),
    (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND",
  );

  const list = await eventService.listEvents(ctx, { page: 1, pageSize: 20 });
  assert.equal(list.items.length, 0);

  // 礼金本身仍在
  const records = await recordService.listRecords(ctx, { page: 1, pageSize: 20 });
  assert.equal(records.total, 2);
});

test("跨账本不能修改 / 删除联系人、事件，也不能把记录挂到别人的事件上", async () => {
  const ledgerA = await createLedgerFixture(db, { name: "A" });
  const ledgerB = await createLedgerFixture(db, { name: "B" });

  const eventA = await eventService.createEvent(ledgerA.ctx, {
    title: "A 的婚礼",
    scene: "WEDDING",
    occurredAt: "2024-05-01",
  });

  await assert.rejects(
    () => contactService.updateContact(ledgerB.ctx, ledgerA.contactId, { name: "改名" }),
    (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND",
  );
  await assert.rejects(
    () => eventService.updateEvent(ledgerB.ctx, eventA.id, { title: "改名" }),
    (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND",
  );
  await assert.rejects(
    () => eventService.deleteEvent(ledgerB.ctx, eventA.id),
    (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND",
  );

  await assert.rejects(
    () =>
      recordService.createRecord(ledgerB.ctx, {
        ...recordInput,
        contactId: ledgerB.contactId,
        eventId: eventA.id,
      }),
    (error: unknown) => error instanceof AppError && error.code === "NOT_FOUND",
  );

  // A 的事件没有被 B 的操作影响
  const detail = await eventService.getEventDetail(ledgerA.ctx, eventA.id);
  assert.equal(detail.event.title, "A 的婚礼");
});

test("事件列表汇总排除已删记录", async () => {
  const { ctx, contactId } = await createLedgerFixture(db);
  const event = await eventService.createEvent(ctx, {
    title: "寿宴",
    scene: "OTHER",
    occurredAt: "2024-06-01",
  });

  const first = await recordService.createRecord(ctx, {
    ...recordInput,
    contactId,
    eventId: event.id,
  });
  await recordService.createRecord(ctx, { ...recordInput, contactId, eventId: event.id });
  await recordService.deleteRecord(ctx, first.record.id);

  const list = await eventService.listEvents(ctx, { page: 1, pageSize: 20 });
  const summary = list.items[0]?.summary;
  assert.equal(summary?.recordCount, 1);
  assert.equal(summary?.receivedTotalCents, 60_000);
});
