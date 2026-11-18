import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { sql } from "drizzle-orm";

import { startTestDatabase } from "./helpers/test-db";

const execFileAsync = promisify(execFile);

const database = await startTestDatabase();

/**
 * 打开数据库限流（测试环境默认关闭，避免 E2E 被 5 次/分钟卡住）。
 * 开启限流只会更严格，不构成安全后门。
 */
process.env.APP_ENV = "test";
process.env.RATE_LIMIT_ENABLED = "true";
process.env.SMS_PROVIDER = "mock";
process.env.OTP_ALLOW_FIXED_CODE = "true";
process.env.OTP_MOCK_CODE = "123456";
process.env.BETTER_AUTH_URL = "http://localhost:3000";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

const { auth } = await import("@/server/auth");
const { db } = await import("@/server/db-drizzle");

let phoneSeq = 0;
function nextPhone(): string {
  phoneSeq += 1;
  return `+861380000${String(1000 + phoneSeq).padStart(4, "0")}`;
}

async function post(pathname: string, body: unknown, ip: string): Promise<Response> {
  return auth.handler(
    new Request(`http://localhost:3000/api/auth${pathname}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-real-ip": ip,
      },
      body: JSON.stringify(body),
    }),
  );
}

test.beforeEach(async () => {
  await database.reset();
});

test.after(async () => {
  await database.close();
});

test("同一 IP 连续发送验证码：第 6 次返回 429", async () => {
  const ip = "203.0.113.10";

  for (let i = 0; i < 5; i += 1) {
    const response = await post("/phone-number/send-otp", { phoneNumber: nextPhone() }, ip);
    assert.equal(response.status, 200, `第 ${i + 1} 次应通过`);
  }

  const blocked = await post("/phone-number/send-otp", { phoneNumber: nextPhone() }, ip);
  assert.equal(blocked.status, 429);
});

test("同一 IP 连续验证验证码：第 11 次返回 429", async () => {
  const ip = "203.0.113.11";
  const phone = nextPhone();

  for (let i = 0; i < 10; i += 1) {
    const response = await post("/phone-number/verify", { phoneNumber: phone, code: "000000" }, ip);
    assert.notEqual(response.status, 429, `第 ${i + 1} 次不应被限流`);
  }

  const blocked = await post("/phone-number/verify", { phoneNumber: phone, code: "000000" }, ip);
  assert.equal(blocked.status, 429);
});

test("不同 IP 的请求互不影响", async () => {
  for (let i = 0; i < 5; i += 1) {
    await post("/phone-number/send-otp", { phoneNumber: nextPhone() }, "203.0.113.20");
  }

  const other = await post("/phone-number/send-otp", { phoneNumber: nextPhone() }, "203.0.113.21");
  assert.equal(other.status, 200);
});

test("伪造/轮换 IP 不能绕过手机号级冷却", async () => {
  const phone = nextPhone();

  const first = await post("/phone-number/send-otp", { phoneNumber: phone }, "198.51.100.1");
  assert.equal(first.status, 200);

  // 换一个 IP：IP 桶是新的，但同一手机号 60 秒内不能再发
  const second = await post("/phone-number/send-otp", { phoneNumber: phone }, "198.51.100.2");
  assert.equal(second.status, 429);
});

test("多值 X-Forwarded-For 在无可信代理时进入共享桶，不能靠拼接头绕过", async () => {
  // x-real-ip 未设置时才会读 XFF；这里用多值链模拟伪造
  const send = (xff: string, phone: string) =>
    auth.handler(
      new Request("http://localhost:3000/api/auth/phone-number/send-otp", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": xff },
        body: JSON.stringify({ phoneNumber: phone }),
      }),
    );

  for (let i = 0; i < 5; i += 1) {
    const response = await send(`10.0.0.${i}, 10.0.0.99`, nextPhone());
    assert.equal(response.status, 200);
  }

  // 换一组伪造地址仍然落在 no-trusted-ip 桶里
  const blocked = await send("172.16.0.1, 172.16.0.2", nextPhone());
  assert.equal(blocked.status, 429);
});

test("多个模拟实例共享同一份限流记录", async () => {
  const ip = "203.0.113.30";
  for (let i = 0; i < 5; i += 1) {
    await post("/phone-number/send-otp", { phoneNumber: nextPhone() }, ip);
  }

  // 断言计数确实落库
  const rows = await db.execute(
    sql`select count, last_request from rate_limit where key = ${`${ip}|/phone-number/send-otp`}`,
  );
  assert.equal(Number(rows.rows[0]?.count), 5);

  // 独立进程重新加载 auth（相当于另一个实例），同一 IP 必须被拒绝
  const probe = path.resolve(process.cwd(), "tests/helpers/rate-limit-probe.ts");
  const { stdout } = await execFileAsync(
    process.execPath,
    ["--import", "tsx", probe, ip, nextPhone()],
    {
      env: {
        ...process.env,
        APP_ENV: "test",
        RATE_LIMIT_ENABLED: "true",
        DATABASE_URL: database.url,
        DB_POOL_MAX: "1",
      },
      timeout: 60_000,
    },
  );

  assert.match(stdout, /PROBE_STATUS=429/);
});

test("限流存储不可用时拒绝请求（不能静默放行）", async () => {
  const ip = "203.0.113.40";

  await db.execute(sql`alter table rate_limit rename to rate_limit_bak`);
  try {
    // auth.handler 直接抛错；在 HTTP 层会被 Next 转成 500。
    // 关键点是「不会返回 200 静默放行」。
    let status = 200;
    try {
      const response = await post("/phone-number/send-otp", { phoneNumber: nextPhone() }, ip);
      status = response.status;
    } catch {
      status = 500;
    }
    assert.ok(status >= 500, `期望 5xx，实际 ${status}`);
  } finally {
    await db.execute(sql`alter table rate_limit_bak rename to rate_limit`);
  }
});
