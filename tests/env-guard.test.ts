import assert from "node:assert/strict";
import test from "node:test";

import {
  checkAuthSecret,
  checkUrl,
  collectConfigProblems,
  ConfigError,
  isPostgresUrl,
  resolveAppEnv,
} from "@/server/env";

type EnvPatch = Record<string, string | undefined>;

const MANAGED_KEYS = [
  "APP_ENV",
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "NEXT_PUBLIC_APP_URL",
  "PRIVACY_PASSWORD",
  "SMS_PROVIDER",
  "OTP_ALLOW_FIXED_CODE",
  "ALLOW_ADMIN_LOGIN",
  "ALLOW_LAN_ACCESS",
  "TENCENT_SMS_SECRET_ID",
  "TENCENT_SMS_SECRET_KEY",
  "TENCENT_SMS_SDK_APP_ID",
  "TENCENT_SMS_SIGN_NAME",
  "TENCENT_SMS_TEMPLATE_ID",
];

function withEnv(patch: EnvPatch, fn: () => void): void {
  const backup = new Map<string, string | undefined>();
  for (const key of MANAGED_KEYS) backup.set(key, process.env[key]);
  try {
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fn();
  } finally {
    for (const [key, value] of backup) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const PRODUCTION_BASE: EnvPatch = {
  DATABASE_URL: "postgresql://user:pass@db.example.com:5432/giftdeal",
  BETTER_AUTH_SECRET: "0F3n4lK9xQ2mW7pR5tY8uJ1cV6bN0sZ4",
  BETTER_AUTH_URL: "https://giftdeal.example.com",
  NEXT_PUBLIC_APP_URL: "https://giftdeal.example.com",
  PRIVACY_PASSWORD: "Nuan-Shi-2026",
  SMS_PROVIDER: "tencent",
  TENCENT_SMS_SECRET_ID: "AKIDxxxxxxxx",
  TENCENT_SMS_SECRET_KEY: "secret-key",
  TENCENT_SMS_SDK_APP_ID: "1400000000",
  TENCENT_SMS_SIGN_NAME: "礼金账本",
  TENCENT_SMS_TEMPLATE_ID: "123456",
  OTP_ALLOW_FIXED_CODE: undefined,
  ALLOW_ADMIN_LOGIN: undefined,
  ALLOW_LAN_ACCESS: undefined,
};

// ------------------------------------------------------------
// 环境解析矩阵（P0）
// ------------------------------------------------------------

test("NODE_ENV=production + APP_ENV=test：拒绝进入测试模式", () => {
  assert.throws(
    () =>
      resolveAppEnv({
        nodeEnv: "production",
        appEnv: "test",
        isBuildPhase: false,
        isTestBuild: false,
      }),
    (error: unknown) => error instanceof ConfigError && /只允许 APP_ENV=production/.test(error.message),
  );
});

test("NODE_ENV=production + APP_ENV=development：同样拒绝", () => {
  assert.throws(
    () => resolveAppEnv({ nodeEnv: "production", appEnv: "development" }),
    ConfigError,
  );
});

test("NODE_ENV=production + 未设置 APP_ENV：严格生产模式", () => {
  assert.equal(resolveAppEnv({ nodeEnv: "production" }), "production");
});

test("NODE_ENV=production + APP_ENV=production：正常生产模式", () => {
  assert.equal(resolveAppEnv({ nodeEnv: "production", appEnv: "production" }), "production");
});

test("NODE_ENV=test + APP_ENV=test：正常测试模式", () => {
  assert.equal(resolveAppEnv({ nodeEnv: "test", appEnv: "test" }), "test");
});

test("测试构建（NEXT_PUBLIC_E2E_BUILD）允许以 test 运行", () => {
  assert.equal(
    resolveAppEnv({ nodeEnv: "production", appEnv: "test", isTestBuild: true }),
    "test",
  );
});

test("测试构建不允许以 production 运行，避免产物身份混乱", () => {
  assert.throws(
    () => resolveAppEnv({ nodeEnv: "production", appEnv: "production", isTestBuild: true }),
    ConfigError,
  );
});

test("生产构建阶段不做运行时判断：APP_ENV=test 也不会让构建失败", () => {
  assert.equal(
    resolveAppEnv({ nodeEnv: "production", appEnv: "test", isBuildPhase: true }),
    "production",
  );
  assert.equal(
    resolveAppEnv({ nodeEnv: "production", appEnv: undefined, isBuildPhase: true }),
    "production",
  );
});

test("NODE_ENV 与 APP_ENV 都未设置：安全失败，不默认成开发环境", () => {
  assert.throws(
    () => resolveAppEnv({}),
    (error: unknown) => error instanceof ConfigError && /无法确定运行环境/.test(error.message),
  );
});

test("非法 APP_ENV：明确报错", () => {
  for (const value of ["staging", "prod", "TEST"]) {
    assert.throws(
      () => resolveAppEnv({ nodeEnv: "test", appEnv: value }),
      (error: unknown) => error instanceof ConfigError && /APP_ENV 只能是/.test(error.message),
    );
  }
});

// ------------------------------------------------------------
// URL / 连接串 / 密钥质量
// ------------------------------------------------------------

test("URL 校验：格式、协议与 HTTPS 要求", () => {
  assert.equal(checkUrl("https://example.com").ok, true);
  assert.equal(checkUrl("http://localhost:3000").ok, true);
  assert.equal(checkUrl("http://example.com", { requireHttps: true }).ok, false);
  assert.equal(checkUrl("not-a-url").ok, false);
  assert.equal(checkUrl("ftp://example.com").ok, false);
  assert.equal(checkUrl("").ok, false);
  assert.equal(checkUrl("   ").ok, false);
});

test("DATABASE_URL 必须是 PostgreSQL 连接串", () => {
  assert.equal(isPostgresUrl("postgresql://u:p@host:5432/db"), true);
  assert.equal(isPostgresUrl("postgres://u:p@host:5432/db"), true);
  assert.equal(isPostgresUrl("mysql://u:p@host:3306/db"), false);
  assert.equal(isPostgresUrl("postgresql://u:p@host:5432"), false);
  assert.equal(isPostgresUrl("postgresql://u:p@host:5432/"), false);
  assert.equal(isPostgresUrl("not a url"), false);
  assert.equal(isPostgresUrl(""), false);
});

test("BETTER_AUTH_SECRET：拒绝短密钥、重复字符与占位符", () => {
  assert.equal(checkAuthSecret("short").ok, false);
  assert.equal(checkAuthSecret("a".repeat(64)).ok, false);
  assert.equal(checkAuthSecret("ci-only-secret-not-used-in-production").ok, false);
  assert.equal(checkAuthSecret("change-me-please-change-me-123456").ok, false);
  assert.equal(checkAuthSecret("请替换为-openssl-rand-base64-32-的输出").ok, false);
  assert.equal(checkAuthSecret("0F3n4lK9xQ2mW7pR5tY8uJ1cV6bN0sZ4").ok, true);
});

// ------------------------------------------------------------
// 生产配置问题清单
// ------------------------------------------------------------

test("生产配置：缺项、空字符串与纯空格都会被指出", () => {
  withEnv(
    {
      ...PRODUCTION_BASE,
      DATABASE_URL: "   ",
      BETTER_AUTH_SECRET: "",
      BETTER_AUTH_URL: "  ",
      NEXT_PUBLIC_APP_URL: "",
      PRIVACY_PASSWORD: " ",
      TENCENT_SMS_SIGN_NAME: "   ",
      TENCENT_SMS_TEMPLATE_ID: "",
    },
    () => {
      const keys = collectConfigProblems("production").map((item) => item.key);
      assert.ok(keys.includes("DATABASE_URL"));
      assert.ok(keys.includes("BETTER_AUTH_SECRET"));
      assert.ok(keys.includes("BETTER_AUTH_URL"));
      assert.ok(keys.includes("NEXT_PUBLIC_APP_URL"));
      assert.ok(keys.includes("PRIVACY_PASSWORD"));
      assert.ok(keys.includes("TENCENT_SMS_*"));
    },
  );
});

test("生产配置：HTTP 地址、错误 URL 与错误数据库串都会被拒绝", () => {
  withEnv(
    {
      ...PRODUCTION_BASE,
      BETTER_AUTH_URL: "http://giftdeal.example.com",
      NEXT_PUBLIC_APP_URL: "giftdeal.example.com",
      DATABASE_URL: "mysql://user:pass@db.example.com/giftdeal",
    },
    () => {
      const problems = collectConfigProblems("production");
      const byKey = new Map(problems.map((item) => [item.key, item.message]));
      assert.match(byKey.get("BETTER_AUTH_URL") ?? "", /https/);
      assert.match(byKey.get("NEXT_PUBLIC_APP_URL") ?? "", /URL/);
      assert.match(byKey.get("DATABASE_URL") ?? "", /PostgreSQL/);
    },
  );
});

test("生产配置：占位符密钥会被拒绝，正常随机密钥通过", () => {
  withEnv({ ...PRODUCTION_BASE, BETTER_AUTH_SECRET: "ci-only-secret-not-used-in-production" }, () => {
    assert.ok(collectConfigProblems("production").some((item) => item.key === "BETTER_AUTH_SECRET"));
  });

  withEnv(PRODUCTION_BASE, () => {
    assert.deepEqual(collectConfigProblems("production"), []);
  });
});

test("生产配置：腾讯云短信格式错误会被指出", () => {
  withEnv(
    {
      ...PRODUCTION_BASE,
      TENCENT_SMS_SDK_APP_ID: "abc",
      TENCENT_SMS_TEMPLATE_ID: "模板一",
      TENCENT_SMS_SIGN_NAME: "这是一个超过二十个字符的短信签名名称示例啊",
    },
    () => {
      const keys = collectConfigProblems("production").map((item) => item.key);
      assert.ok(keys.includes("TENCENT_SMS_SDK_APP_ID"));
      assert.ok(keys.includes("TENCENT_SMS_TEMPLATE_ID"));
      assert.ok(keys.includes("TENCENT_SMS_SIGN_NAME"));
    },
  );
});
