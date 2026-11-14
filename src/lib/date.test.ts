import assert from "node:assert/strict";
import { test } from "node:test";

import {
  daysSince,
  daysUntil,
  isOccurredAtInRange,
  isRealDateOnly,
  parseDateOnly,
  toDateOnly,
  todayDateOnly,
} from "./date";

test("todayDateOnly 按东八区算，不会退回 UTC 的前一天", () => {
  // 北京 2026-11-14 03:00，此时 UTC 还是 2026-11-13 19:00
  assert.equal(todayDateOnly(new Date("2026-11-13T19:00:00Z")), "2026-11-14");
});

test("todayDateOnly 正确处理跨年", () => {
  // 北京 2027-01-01 00:30
  assert.equal(todayDateOnly(new Date("2026-12-31T16:30:00Z")), "2027-01-01");
});

test("daysSince 以应用时区的今天为基准", () => {
  const now = new Date("2026-11-13T19:00:00Z"); // 北京 11-14
  assert.equal(daysSince(parseDateOnly("2026-11-10"), now), 4);
  assert.equal(daysSince(parseDateOnly("2026-11-14"), now), 0);
});

test("daysUntil 未来为正、过去为负", () => {
  const now = new Date("2026-11-13T19:00:00Z"); // 北京 11-14
  assert.equal(daysUntil(parseDateOnly("2026-11-20"), now), 6);
  assert.equal(daysUntil(parseDateOnly("2026-11-14"), now), 0);
  assert.equal(daysUntil(parseDateOnly("2026-11-12"), now), -2);
});

test("isRealDateOnly 拒绝不存在的日期", () => {
  assert.equal(isRealDateOnly("2026-02-28"), true);
  assert.equal(isRealDateOnly("2026-02-30"), false);
  assert.equal(isRealDateOnly("2026-2-3"), false);
  assert.equal(isRealDateOnly("not-a-date"), false);
});

test("toDateOnly / parseDateOnly 往返一致", () => {
  assert.equal(toDateOnly(parseDateOnly("2026-11-14")), "2026-11-14");
});

test("isOccurredAtInRange 允许过去、拒绝过远的未来", () => {
  const now = new Date("2026-11-13T19:00:00Z");
  assert.equal(isOccurredAtInRange("2020-01-01", now), true);
  assert.equal(isOccurredAtInRange("2026-11-14", now), true);
  assert.equal(isOccurredAtInRange("2030-01-01", now), false);
  assert.equal(isOccurredAtInRange("1949-12-31", now), false);
});
