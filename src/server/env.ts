/**
 * 统一环境配置。
 *
 * 为什么要有这个模块：
 * - 之前 `PRIVACY_PASSWORD` / `SMS_PROVIDER` / `ALLOW_ADMIN_LOGIN` 等变量散落在
 *   auth、otp、privacy、路由里各自读取，生产环境忘记配置时会「静默降级」成弱默认值。
 * - 现在所有「危险开关」只在这里判断，开发环境照常开箱即用，生产环境缺配置直接报错。
 *
 * 环境划分（APP_ENV）：
 * - development：本地开发（`next dev`）
 * - test：CI / 冒烟 / E2E。允许 mock 短信与固定验证码，但日志不打印验证码
 * - production：真实部署。禁止 mock 短信、固定验证码、admin 快捷登录、局域网白名单
 *
 * APP_ENV 未设置时按 NODE_ENV 推断：production → production，其余 → development。
 * 也就是说：**生产构建默认走最严格的一档**，必须显式降级才会放开（CI 会显式设 test）。
 *
 * 注意：本模块只做「读 + 校验」，不主动连接任何外部服务，可以在构建期安全导入。
 */

export type AppEnv = "development" | "test" | "production";

export const APP_ENVS: readonly AppEnv[] = ["development", "test", "production"];

function readAppEnv(): AppEnv {
  const raw = process.env.APP_ENV?.trim();
  if (raw) {
    if ((APP_ENVS as readonly string[]).includes(raw)) return raw as AppEnv;
    throw new Error(`APP_ENV 只能是 ${APP_ENVS.join(" / ")} 之一，当前值：${raw}`);
  }
  if (process.env.NODE_ENV === "production") return "production";
  if (process.env.NODE_ENV === "test") return "test";
  return "development";
}

export const appEnv: AppEnv = readAppEnv();
export const isProduction = appEnv === "production";
export const isTest = appEnv === "test";
export const isDevelopment = appEnv === "development";

/** 读取布尔开关：只认 "true" / "1"，其余（含未设置）都为 false */
export function envFlag(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "true" || value === "1";
}

/**
 * 开发期开关：生产环境永远返回 false。
 * 用于 ALLOW_ADMIN_LOGIN / OTP_ALLOW_FIXED_CODE / ALLOW_LAN_ACCESS 这类只该在本地出现的功能。
 */
export function devOnlyFlag(name: string, envName: AppEnv = appEnv): boolean {
  return envName !== "production" && envFlag(name);
}

function present(value: string | undefined): boolean {
  return Boolean(value && value.trim());
}

// ------------------------------------------------------------
// 隐私密码
// ------------------------------------------------------------

/** 仅开发/测试环境使用的体验密码；生产环境永远不会回退到它 */
export const DEV_PRIVACY_PASSWORD = "331633";

const WEAK_PASSWORDS = new Set([
  "331633",
  "123456",
  "1234567",
  "12345678",
  "123456789",
  "000000",
  "111111",
  "888888",
  "666666",
  "password",
  "password1",
  "giftdeal",
  "qwertyui",
]);

function isSequentialDigits(value: string): boolean {
  if (!/^\d+$/.test(value)) return false;
  let ascending = true;
  let descending = true;
  for (let i = 1; i < value.length; i += 1) {
    const diff = Number(value[i]) - Number(value[i - 1]);
    if (diff !== 1) ascending = false;
    if (diff !== -1) descending = false;
  }
  return ascending || descending;
}

export type PasswordCheck = { ok: true } | { ok: false; reason: string };

/** 隐私密码强度：至少 8 位，且不能是重复字符 / 连续数字 / 常见弱口令 */
export function checkPrivacyPassword(value: string): PasswordCheck {
  const password = value.trim();
  if (password.length < 8) return { ok: false, reason: "至少 8 位字符" };
  if (password.length > 128) return { ok: false, reason: "不能超过 128 位字符" };
  if (/^(.)\1+$/.test(password)) return { ok: false, reason: "不能是同一个字符重复" };
  if (isSequentialDigits(password)) return { ok: false, reason: "不能是连续数字" };
  if (WEAK_PASSWORDS.has(password.toLowerCase())) {
    return { ok: false, reason: "不能使用常见弱口令或默认密码" };
  }
  return { ok: true };
}

export class ConfigError extends Error {
  readonly key: string;

  constructor(key: string, message: string) {
    super(message);
    this.name = "ConfigError";
    this.key = key;
  }
}

/**
 * 取隐私密码。
 * - 开发 / 测试：允许不配置，回退到 331633，方便本地体验
 * - 生产：必须显式配置且满足强度要求，否则抛 ConfigError（接口返回 503，不会静默放行）
 */
export function privacyPassword(envName: AppEnv = appEnv): string {
  const configured = process.env.PRIVACY_PASSWORD?.trim();
  if (envName !== "production") return configured || DEV_PRIVACY_PASSWORD;

  if (!configured) {
    throw new ConfigError(
      "PRIVACY_PASSWORD",
      "生产环境必须显式配置 PRIVACY_PASSWORD，已停止回退到默认密码",
    );
  }
  const check = checkPrivacyPassword(configured);
  if (!check.ok) {
    throw new ConfigError("PRIVACY_PASSWORD", `PRIVACY_PASSWORD 不符合安全要求：${check.reason}`);
  }
  return configured;
}

// ------------------------------------------------------------
// 短信 / 验证码
// ------------------------------------------------------------

export const SMS_PROVIDERS = ["mock", "tencent"] as const;
export type SmsProviderName = (typeof SMS_PROVIDERS)[number];

/** 是否允许固定验证码：只在非生产环境且显式开启时生效 */
export function fixedOtpCodeEnabled(envName: AppEnv = appEnv): boolean {
  return devOnlyFlag("OTP_ALLOW_FIXED_CODE", envName);
}

/** 固定验证码本身；生产环境永远不会被使用 */
export function fixedOtpCode(): string {
  return process.env.OTP_MOCK_CODE?.trim() || "123456";
}

/** 短信通道：开发默认 mock，生产必须显式配置 */
export function smsProviderName(envName: AppEnv = appEnv): SmsProviderName {
  const raw = process.env.SMS_PROVIDER?.trim().toLowerCase();
  if (!raw) {
    if (envName === "production") {
      throw new ConfigError("SMS_PROVIDER", "生产环境必须显式配置 SMS_PROVIDER（当前支持 tencent）");
    }
    return "mock";
  }
  if (!(SMS_PROVIDERS as readonly string[]).includes(raw)) {
    throw new ConfigError("SMS_PROVIDER", `未知的 SMS_PROVIDER：${raw}`);
  }
  return raw as SmsProviderName;
}

export const TENCENT_SMS_KEYS = [
  "TENCENT_SMS_SECRET_ID",
  "TENCENT_SMS_SECRET_KEY",
  "TENCENT_SMS_SDK_APP_ID",
  "TENCENT_SMS_SIGN_NAME",
  "TENCENT_SMS_TEMPLATE_ID",
] as const;

export function missingTencentSmsKeys(): string[] {
  return TENCENT_SMS_KEYS.filter((key) => !present(process.env[key]));
}

export type TencentSmsConfig = {
  secretId: string;
  secretKey: string;
  sdkAppId: string;
  signName: string;
  templateId: string;
  region: string;
};

/** 腾讯云短信配置：缺任意一项都直接抛错，避免等到用户点「获取验证码」才暴露 */
export function tencentSmsConfig(): TencentSmsConfig {
  const missing = missingTencentSmsKeys();
  if (missing.length > 0) {
    throw new ConfigError("TENCENT_SMS_*", `腾讯云短信缺少环境变量：${missing.join("、")}`);
  }

  return {
    secretId: process.env.TENCENT_SMS_SECRET_ID!.trim(),
    secretKey: process.env.TENCENT_SMS_SECRET_KEY!.trim(),
    sdkAppId: process.env.TENCENT_SMS_SDK_APP_ID!.trim(),
    signName: process.env.TENCENT_SMS_SIGN_NAME!.trim(),
    templateId: process.env.TENCENT_SMS_TEMPLATE_ID!.trim(),
    region: process.env.TENCENT_SMS_REGION?.trim() || "ap-guangzhou",
  };
}

// ------------------------------------------------------------
// 生产环境配置校验
// ------------------------------------------------------------

export type ConfigProblem = { key: string; message: string };

/**
 * 列出生产环境的配置问题。纯函数式读取 process.env，方便单测覆盖。
 * 返回空数组 = 可以启动。
 */
export function collectConfigProblems(envName: AppEnv = appEnv): ConfigProblem[] {
  if (envName !== "production") return [];

  const problems: ConfigProblem[] = [];
  const add = (key: string, message: string) => problems.push({ key, message });

  const secret = process.env.BETTER_AUTH_SECRET?.trim() ?? "";
  if (!secret) add("BETTER_AUTH_SECRET", "必须配置会话与隐私 Cookie 的签名密钥");
  else if (secret.length < 32) add("BETTER_AUTH_SECRET", "长度至少 32 字符（建议 openssl rand -base64 32）");

  const authUrl = process.env.BETTER_AUTH_URL?.trim() ?? "";
  if (!authUrl) add("BETTER_AUTH_URL", "必须配置生产域名，例如 https://example.com");
  else if (!/^https?:\/\//.test(authUrl)) add("BETTER_AUTH_URL", "必须是完整的 http(s) 地址");

  if (!present(process.env.NEXT_PUBLIC_APP_URL)) {
    add("NEXT_PUBLIC_APP_URL", "必须配置邀请链接使用的站点地址");
  }

  if (!present(process.env.DATABASE_URL)) add("DATABASE_URL", "必须配置数据库连接串");

  try {
    privacyPassword(envName);
  } catch (error) {
    add("PRIVACY_PASSWORD", error instanceof Error ? error.message : "隐私密码配置不合法");
  }

  let provider: SmsProviderName | null = null;
  try {
    provider = smsProviderName(envName);
  } catch (error) {
    add("SMS_PROVIDER", error instanceof Error ? error.message : "短信通道配置不合法");
  }

  if (provider === "mock") {
    add(
      "SMS_PROVIDER",
      "生产环境禁止使用 mock 短信通道：验证码无法送达，且可能被日志泄露。请配置 SMS_PROVIDER=tencent",
    );
  }
  if (provider === "tencent") {
    const missing = missingTencentSmsKeys();
    if (missing.length > 0) {
      add("TENCENT_SMS_*", `腾讯云短信缺少环境变量：${missing.join("、")}`);
    }
  }

  if (envFlag("OTP_ALLOW_FIXED_CODE")) {
    add("OTP_ALLOW_FIXED_CODE", "生产环境禁止固定验证码，请删除该变量或设为 false");
  }
  if (envFlag("ALLOW_ADMIN_LOGIN")) {
    add("ALLOW_ADMIN_LOGIN", "生产环境禁止 admin 快捷登录，请删除该变量或设为 false");
  }
  if (envFlag("ALLOW_LAN_ACCESS")) {
    add("ALLOW_LAN_ACCESS", "生产环境禁止放行局域网来源，请删除该变量或设为 false");
  }

  return problems;
}

export class ProductionConfigError extends Error {
  readonly problems: ConfigProblem[];

  constructor(problems: ConfigProblem[]) {
    super(
      [
        "生产环境配置检查未通过，服务已拒绝启动：",
        ...problems.map((item) => `  - ${item.key}: ${item.message}`),
        "本地演示/CI 请设置 APP_ENV=test；真实部署请补齐上述配置。",
      ].join("\n"),
    );
    this.name = "ProductionConfigError";
    this.problems = problems;
  }
}

/** 生产环境启动自检：有问题直接抛错（由 instrumentation.ts 调用） */
export function assertProductionConfig(): void {
  const problems = collectConfigProblems();
  if (problems.length > 0) throw new ProductionConfigError(problems);
}
