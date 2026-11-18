import assert from "node:assert/strict";
import test from "node:test";

import {
  checkPrivacyPassword,
  collectConfigProblems,
  ConfigError,
  devOnlyFlag,
  fixedOtpCodeEnabled,
  privacyPassword,
  smsProviderName,
} from "@/server/env";
import { createOtpProvider, maskPhoneForLog } from "@/server/otp";

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

/** 临时改环境变量并在结束后恢复，避免测试之间互相污染 */
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
  // 显式清空开发开关：CI 会把这些变量设在 job 级别，不清掉会污染「完整生产配置」用例
  OTP_ALLOW_FIXED_CODE: undefined,
  ALLOW_ADMIN_LOGIN: undefined,
  ALLOW_LAN_ACCESS: undefined,
};

test("隐私密码强度：默认密码、重复字符、连续数字和常见弱口令都不合格", () => {
  assert.equal(checkPrivacyPassword("331633").ok, false);
  assert.equal(checkPrivacyPassword("123456").ok, false);
  assert.equal(checkPrivacyPassword("aaaaaaaa").ok, false);
  assert.equal(checkPrivacyPassword("12345678").ok, false);
  assert.equal(checkPrivacyPassword("87654321").ok, false);
  assert.equal(checkPrivacyPassword("password").ok, false);
  assert.equal(checkPrivacyPassword("short7!").ok, false);
  assert.equal(checkPrivacyPassword("Nuan-Shi-2026").ok, true);
  assert.equal(checkPrivacyPassword("k9#Qv2Lm8@").ok, true);
});

test("开发环境沿用默认隐私密码，生产环境必须显式配置", () => {
  withEnv({ PRIVACY_PASSWORD: undefined }, () => {
    assert.equal(privacyPassword("development"), "331633");
    assert.equal(privacyPassword("test"), "331633");
    assert.throws(() => privacyPassword("production"), ConfigError);
  });

  withEnv({ PRIVACY_PASSWORD: "331633" }, () => {
    assert.throws(() => privacyPassword("production"), ConfigError);
  });

  withEnv({ PRIVACY_PASSWORD: "Nuan-Shi-2026" }, () => {
    assert.equal(privacyPassword("production"), "Nuan-Shi-2026");
  });
});

test("生产配置：完整配置无问题", () => {
  withEnv(PRODUCTION_BASE, () => {
    assert.deepEqual(collectConfigProblems("production"), []);
  });
});

test("生产配置：mock 短信、固定验证码、admin 登录、局域网白名单都会被拦下", () => {
  withEnv(
    {
      ...PRODUCTION_BASE,
      SMS_PROVIDER: "mock",
      OTP_ALLOW_FIXED_CODE: "true",
      ALLOW_ADMIN_LOGIN: "true",
      ALLOW_LAN_ACCESS: "true",
    },
    () => {
      const problems = collectConfigProblems("production");
      const keys = problems.map((item) => item.key);
      assert.ok(keys.includes("SMS_PROVIDER"));
      assert.ok(keys.includes("OTP_ALLOW_FIXED_CODE"));
      assert.ok(keys.includes("ALLOW_ADMIN_LOGIN"));
      assert.ok(keys.includes("ALLOW_LAN_ACCESS"));
    },
  );
});

test("生产配置：未配置真实短信通道时明确报错，而不是静默降级", () => {
  withEnv({ ...PRODUCTION_BASE, SMS_PROVIDER: undefined }, () => {
    assert.throws(() => smsProviderName("production"), ConfigError);
    const problems = collectConfigProblems("production");
    assert.ok(problems.some((item) => item.key === "SMS_PROVIDER"));
  });

  withEnv(
    {
      ...PRODUCTION_BASE,
      TENCENT_SMS_SIGN_NAME: undefined,
      TENCENT_SMS_TEMPLATE_ID: undefined,
    },
    () => {
      const problems = collectConfigProblems("production");
      const smsProblem = problems.find((item) => item.key === "TENCENT_SMS_*");
      assert.ok(smsProblem);
      assert.match(smsProblem!.message, /TENCENT_SMS_SIGN_NAME/);
      assert.match(smsProblem!.message, /TENCENT_SMS_TEMPLATE_ID/);
    },
  );
});

test("生产配置：缺少密钥 / 数据库 / 域名时逐项列出", () => {
  withEnv(
    {
      ...PRODUCTION_BASE,
      DATABASE_URL: undefined,
      BETTER_AUTH_SECRET: "too-short",
      BETTER_AUTH_URL: undefined,
      NEXT_PUBLIC_APP_URL: undefined,
      PRIVACY_PASSWORD: undefined,
    },
    () => {
      const keys = collectConfigProblems("production").map((item) => item.key);
      assert.ok(keys.includes("DATABASE_URL"));
      assert.ok(keys.includes("BETTER_AUTH_SECRET"));
      assert.ok(keys.includes("BETTER_AUTH_URL"));
      assert.ok(keys.includes("NEXT_PUBLIC_APP_URL"));
      assert.ok(keys.includes("PRIVACY_PASSWORD"));
    },
  );
});

test("开发 / 测试环境不因为缺少生产配置而报错", () => {
  withEnv({ ...PRODUCTION_BASE, SMS_PROVIDER: "mock", OTP_ALLOW_FIXED_CODE: "true" }, () => {
    assert.deepEqual(collectConfigProblems("development"), []);
    assert.deepEqual(collectConfigProblems("test"), []);
  });
});

test("开发开关在生产环境一律失效", () => {
  withEnv({ OTP_ALLOW_FIXED_CODE: "true", ALLOW_ADMIN_LOGIN: "true" }, () => {
    assert.equal(fixedOtpCodeEnabled("production"), false);
    assert.equal(devOnlyFlag("ALLOW_ADMIN_LOGIN", "production"), false);
    assert.equal(fixedOtpCodeEnabled("development"), true);
    assert.equal(devOnlyFlag("ALLOW_ADMIN_LOGIN", "development"), true);
  });
});

test("生产环境构造 mock 短信通道直接抛错", () => {
  withEnv({ SMS_PROVIDER: "mock" }, () => {
    assert.throws(() => createOtpProvider("production"), ConfigError);
    assert.equal(createOtpProvider("development").name, "mock");
  });
});

test("日志里的手机号始终打码", () => {
  assert.equal(maskPhoneForLog("+8613800000001"), "138****0001");
  assert.equal(maskPhoneForLog("13800000001"), "138****0001");
  assert.equal(maskPhoneForLog("123"), "***");
});
