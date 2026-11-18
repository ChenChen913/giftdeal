import assert from "node:assert/strict";
import test from "node:test";

import { AppError } from "@/server/http/errors";
import { startTestDatabase } from "./helpers/test-db";
import { createUser, type Db } from "./helpers/fixtures";

const database = await startTestDatabase();
const { db } = (await import("@/server/db-drizzle")) as unknown as { db: Db };
const privacy = await import("@/server/privacy");
const throttle = await import("@/server/throttle");

const DEV_PASSWORD = "331633";
const WRONG_PASSWORD = "000000";

function requestWithCookie(value: string): Request {
  return new Request("http://localhost/api/v1/privacy/status", {
    headers: { cookie: `${privacy.PRIVACY_COOKIE}=${encodeURIComponent(value)}` },
  });
}

test.beforeEach(async () => {
  await database.reset();
});

test.after(async () => {
  await database.close();
});

test("密码错误会计次并提示剩余次数", async () => {
  const userId = await createUser(db);

  await assert.rejects(
    () => privacy.verifyPrivacyPassword(userId, WRONG_PASSWORD),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === "PRIVACY_PASSWORD_INVALID" &&
      /4 次/.test(error.message),
  );

  const state = await throttle.readThrottle(
    throttle.throttleKeys.privacyFail(userId),
    privacy.PRIVACY_MAX_ATTEMPTS,
    privacy.PRIVACY_LOCK_SECONDS,
  );
  assert.equal(state.count, 1);
});

test("连续输错 5 次锁定；锁定时正确密码也不能解锁", async () => {
  const userId = await createUser(db);

  for (let i = 0; i < privacy.PRIVACY_MAX_ATTEMPTS - 1; i += 1) {
    await assert.rejects(() => privacy.verifyPrivacyPassword(userId, WRONG_PASSWORD));
  }

  await assert.rejects(
    () => privacy.verifyPrivacyPassword(userId, WRONG_PASSWORD),
    (error: unknown) => error instanceof AppError && error.code === "PRIVACY_LOCKED",
  );

  await assert.rejects(
    () => privacy.verifyPrivacyPassword(userId, DEV_PASSWORD),
    (error: unknown) => error instanceof AppError && error.code === "PRIVACY_LOCKED",
  );
});

test("锁定计数按用户隔离，不会误伤其他人", async () => {
  const first = await createUser(db, "甲");
  const second = await createUser(db, "乙");

  for (let i = 0; i < privacy.PRIVACY_MAX_ATTEMPTS; i += 1) {
    await assert.rejects(() => privacy.verifyPrivacyPassword(first, WRONG_PASSWORD));
  }

  const cookie = await privacy.verifyPrivacyPassword(second, DEV_PASSWORD);
  assert.ok(cookie.value);
});

test("验证通过后签发 Cookie：绑定用户、可读取状态、可主动清除", async () => {
  const userId = await createUser(db);
  const otherId = await createUser(db, "别人");

  await assert.rejects(() => privacy.verifyPrivacyPassword(userId, WRONG_PASSWORD));

  const cookie = await privacy.verifyPrivacyPassword(userId, DEV_PASSWORD);
  assert.ok(cookie.value.includes("."));

  assert.deepEqual(privacy.privacyStatus(requestWithCookie(cookie.value), userId), {
    unlocked: true,
    expiresAt: cookie.expiresAt,
  });

  // 换个用户拿同一个 Cookie 不算解锁
  assert.equal(privacy.privacyStatus(requestWithCookie(cookie.value), otherId).unlocked, false);

  // 密码正确后计数清零
  const state = await throttle.readThrottle(
    throttle.throttleKeys.privacyFail(userId),
    privacy.PRIVACY_MAX_ATTEMPTS,
    privacy.PRIVACY_LOCK_SECONDS,
  );
  assert.equal(state.count, 0);

  // 伪造 / 篡改的 Cookie 不解锁
  const tampered = `${cookie.value.slice(0, -2)}xx`;
  assert.equal(privacy.privacyStatus(requestWithCookie(tampered), userId).unlocked, false);
  assert.equal(privacy.privacyStatus(requestWithCookie("garbage"), userId).unlocked, false);
});

test("锁定到期后可以重新尝试（清空计数模拟窗口过期）", async () => {
  const userId = await createUser(db);

  for (let i = 0; i < privacy.PRIVACY_MAX_ATTEMPTS; i += 1) {
    await assert.rejects(() => privacy.verifyPrivacyPassword(userId, WRONG_PASSWORD));
  }
  await assert.rejects(() => privacy.verifyPrivacyPassword(userId, DEV_PASSWORD));

  await throttle.clearThrottle(throttle.throttleKeys.privacyFail(userId));

  const cookie = await privacy.verifyPrivacyPassword(userId, DEV_PASSWORD);
  assert.ok(cookie.value);
});

test("异常 Cookie（非法百分号编码 / 乱码）按未解锁处理，不抛 500", async () => {
  const userId = await createUser(db);

  const malformed = [
    "%E0%A4%A",
    "%",
    "%ZZ",
    "%E4%ZZ",
    "abc%",
    "not-a-token",
    "",
    "a.b.c",
  ];

  for (const value of malformed) {
    const request = new Request("http://localhost/api/v1/privacy/status", {
      headers: { cookie: `${privacy.PRIVACY_COOKIE}=${value}` },
    });
    assert.doesNotThrow(() => privacy.privacyStatus(request, userId));
    assert.equal(privacy.privacyStatus(request, userId).unlocked, false, `cookie=${value}`);
  }
});

test("Cookie 头格式异常（缺少等号 / 多个分号）不影响判定", async () => {
  const userId = await createUser(db);
  const request = new Request("http://localhost/api/v1/privacy/status", {
    headers: { cookie: `foo; ${privacy.PRIVACY_COOKIE}; bar=baz` },
  });

  assert.equal(privacy.privacyStatus(request, userId).unlocked, false);
});
