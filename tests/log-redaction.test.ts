import assert from "node:assert/strict";
import test from "node:test";

import { redactErrorMessage } from "@/server/http/log";

test("错误摘要会去掉数据库连接串", () => {
  const text = redactErrorMessage("connect failed: postgresql://user:pass@db.example.com:5432/giftdeal");
  assert.ok(!text.includes("user:pass"));
  assert.ok(text.includes("postgresql://[redacted]"));
});

test("错误摘要会去掉手机号与验证码", () => {
  const text = redactErrorMessage("send to +8613800000001 failed, code=654321");
  assert.ok(!text.includes("13800000001"));
  assert.ok(!text.includes("654321"));
  assert.ok(text.includes("[phone]"));
  assert.ok(text.includes("[code]"));
});

test("Drizzle 的 params 段整体脱敏", () => {
  const text = redactErrorMessage(
    'Failed query: insert into "user" values ($1, $2) params: 13800000001, 王建国',
  );
  assert.ok(!text.includes("王建国"));
  assert.ok(!text.includes("13800000001"));
  assert.match(text, /params: \[redacted\]/);
});

test("普通错误信息保持可读", () => {
  const text = redactErrorMessage("腾讯云短信未送达：LimitExceeded 请求过于频繁");
  assert.equal(text, "腾讯云短信未送达：LimitExceeded 请求过于频繁");
});

test("超长信息会被截断，避免日志被刷爆", () => {
  const text = redactErrorMessage("x".repeat(2000));
  assert.ok(text.length <= 400);
});
