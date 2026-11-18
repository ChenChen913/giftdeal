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
 * 运行时安全边界（2026-11 加固）：
 * - `NODE_ENV=production` 的进程只允许 `APP_ENV=production`。
 *   误配 `APP_ENV=test` 会直接拒绝启动，而不是悄悄进入测试模式。
 * - 唯一例外是「显式标记的测试构建」：构建时设置 `NEXT_PUBLIC_E2E_BUILD=1`，
 *   该值会被 Next 内联进产物；运行时无法通过环境变量伪造。
 *   真实生产构建永远没有这个标记，因此 `APP_ENV=test` 无法生效。
 * - `next build` 阶段（NEXT_PHASE=phase-production-build）不做运行时判断，
 *   也永远不会因为缺少运行时密钥而失败；构建产物一律按 production 处理。
 */

export type AppEnv = "development" | "test" | "production";

export const APP_ENVS: readonly AppEnv[] = ["development", "test", "production"];

export class ConfigError extends Error {
  readonly key: string;

  constructor(key: string, message: string) {
    super(message);
    this.name = "ConfigError";
    this.key = key;
  }
}

export type AppEnvInput = {
  nodeEnv?: string;
  appEnv?: string;
  /** Next 构建阶段（NEXT_PHASE=phase-production-build） */
  isBuildPhase?: boolean;
  /** 构建时是否显式打了测试标记（NEXT_PUBLIC_E2E_BUILD=1，被内联进产物） */
  isTestBuild?: boolean;
};

/**
 * 解析运行环境。纯函数，便于单测覆盖所有组合。
 *
 * 规则（按顺序判定）：
 * 1. 非法 APP_ENV → 抛错（安全失败，不猜测）
 * 2. 构建阶段 → 一律 production（构建产物按生产标准生成；不校验运行时密钥）
 * 3. 测试构建（构建期内联标记）→ 只接受 test
 * 4. `APP_ENV=test` 只允许来自「测试构建」或 `NODE_ENV=test`：
 *    否则一个生产构建在 NODE_ENV 缺失/被改写时会以测试模式运行
 * 5. NODE_ENV=production → 只接受 production，显式 test/development 一律拒绝
 * 6. 其他（开发 / 单测进程）→ 显式 APP_ENV 优先，否则按 NODE_ENV 推断
 */
export function resolveAppEnv(input: AppEnvInput): AppEnv {
  const raw = input.appEnv?.trim();
  if (raw && !(APP_ENVS as readonly string[]).includes(raw)) {
    throw new ConfigError(
      "APP_ENV",
      `APP_ENV 只能是 ${APP_ENVS.join(" / ")} 之一，当前值：${raw}`,
    );
  }
  const requested = (raw || undefined) as AppEnv | undefined;
  const nodeEnv = input.nodeEnv?.trim();

  // 构建阶段：不执行运行时安全判断，也不允许测试模式影响构建产物
  if (input.isBuildPhase) return "production";

  // 测试构建：标记在构建期被内联，运行时无法伪造
  if (input.isTestBuild) {
    if (requested && requested !== "test") {
      throw new ConfigError(
        "APP_ENV",
        `这是测试构建（NEXT_PUBLIC_E2E_BUILD=1），只能以 APP_ENV=test 运行，当前为 ${requested}`,
      );
    }
    return "test";
  }

  /**
   * 关键防线：测试模式必须能被证明来源。
   * 生产构建（没有内联标记）只有在 NODE_ENV=test 时才允许 test；
   * 否则 `APP_ENV=test` + 缺失/被改写的 NODE_ENV 就能把生产构建降级成测试模式。
   */
  if (requested === "test" && nodeEnv !== "test") {
    throw new ConfigError(
      "APP_ENV",
      "APP_ENV=test 只允许在 NODE_ENV=test 或显式测试构建（npm run build:test）下使用；" +
        `当前 NODE_ENV=${nodeEnv ?? "(未设置)"}。生产构建禁止进入测试模式。`,
    );
  }

  if (nodeEnv === "production") {
    if (requested && requested !== "production") {
      throw new ConfigError(
        "APP_ENV",
        `NODE_ENV=production 下只允许 APP_ENV=production（当前 ${requested}）。` +
          "生产环境禁止使用测试/开发模式；如需运行 E2E，请使用显式测试构建（npm run build:test）。",
      );
    }
    return "production";
  }

  if (requested) return requested;
  if (!nodeEnv) {
    // 环境识别不明确时安全失败：绝不默认成 development（会放开 mock 短信/固定码）
    throw new ConfigError(
      "APP_ENV",
      "无法确定运行环境：NODE_ENV 与 APP_ENV 都未设置。请显式设置 APP_ENV=development / test / production",
    );
  }
  return nodeEnv === "test" ? "test" : "development";
}

const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
/**
 * NEXT_PUBLIC_* 会在构建时被内联为字面量，运行时修改环境变量无效。
 * 这是「测试构建」与「生产构建」的唯一区分依据。
 */
const isTestBuild = process.env.NEXT_PUBLIC_E2E_BUILD === "1";

export const appEnv: AppEnv = resolveAppEnv({
  nodeEnv: process.env.NODE_ENV,
  appEnv: process.env.APP_ENV,
  isBuildPhase,
  isTestBuild,
});
export const isProduction = appEnv === "production";
export const isTest = appEnv === "test";
export const isDevelopment = appEnv === "development";

/** 当前是否为测试构建产物（供启动日志/文档使用，不参与安全判断） */
export const isTestBuildRuntime = isTestBuild;

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

/**
 * 限流总开关。
 * 生产环境始终开启；测试/开发环境默认关闭，但可以用 RATE_LIMIT_ENABLED=true 打开，
 * 以便服务层测试真实覆盖数据库限流（开启限流只会更严格，不构成安全后门）。
 */
export function rateLimitEnabled(envName: AppEnv = appEnv): boolean {
  return envName === "production" || envFlag("RATE_LIMIT_ENABLED");
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
// URL / 连接串 / 密钥质量
// ------------------------------------------------------------

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

/** 校验完整 URL；requireHttps 时只接受 https */
export function checkUrl(value: string, options: { requireHttps?: boolean } = {}): UrlCheck {
  const raw = value.trim();
  if (!raw) return { ok: false, reason: "不能为空" };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "不是合法的完整 URL" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "只支持 http / https" };
  }
  if (options.requireHttps && url.protocol !== "https:") {
    return { ok: false, reason: "生产环境必须使用 https" };
  }
  if (!url.hostname) return { ok: false, reason: "缺少主机名" };
  return { ok: true, url };
}

/** PostgreSQL 连接串：协议、主机、数据库名缺一不可 */
export function isPostgresUrl(value: string): boolean {
  const raw = value.trim();
  if (!raw || /\s/.test(raw)) return false;
  try {
    const url = new URL(raw);
    if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") return false;
    if (!url.hostname) return false;
    if (!url.pathname || url.pathname === "/") return false;
    return true;
  } catch {
    return false;
  }
}

const PLACEHOLDER_SECRET_PATTERNS: RegExp[] = [
  /^change[-_ ]?me/i,
  /^replace[-_ ]?me/i,
  /^your[-_ ]/i,
  /^example/i,
  /^placeholder/i,
  /^secret$/i,
  /^password$/i,
  /^test[-_ ]/i,
  /^ci-only/i,
  /^dev-only/i,
  /请替换/,
  /xxxx/i,
  /\*\*\*\*/,
];

/**
 * 会话/签名密钥质量检查：长度、字符多样性、明显占位符。
 * 只返回原因，不回显密钥本身。
 */
export function checkAuthSecret(value: string): { ok: true } | { ok: false; reason: string } {
  const secret = value.trim();
  if (!secret) return { ok: false, reason: "不能为空" };
  if (secret.length < 32) return { ok: false, reason: "长度至少 32 字符" };
  if (secret.length > 256) return { ok: false, reason: "长度不能超过 256 字符" };
  if (new Set(secret).size < 12) return { ok: false, reason: "字符重复度过高，请使用随机生成的密钥" };
  if (PLACEHOLDER_SECRET_PATTERNS.some((pattern) => pattern.test(secret))) {
    return { ok: false, reason: "看起来是占位符/示例值，请使用随机生成的密钥" };
  }
  if (/^(.)\1+$/.test(secret)) return { ok: false, reason: "不能是同一个字符重复" };
  return { ok: true };
}

function checkTencentFormats(): string[] {
  const problems: string[] = [];

  const sdkAppId = process.env.TENCENT_SMS_SDK_APP_ID?.trim() ?? "";
  if (sdkAppId && !/^\d{5,12}$/.test(sdkAppId)) {
    problems.push("TENCENT_SMS_SDK_APP_ID: 应为 5–12 位数字（1400 开头）");
  }

  const templateId = process.env.TENCENT_SMS_TEMPLATE_ID?.trim() ?? "";
  if (templateId && !/^\d{3,}$/.test(templateId)) {
    problems.push("TENCENT_SMS_TEMPLATE_ID: 应为纯数字模板 ID");
  }

  const signName = process.env.TENCENT_SMS_SIGN_NAME?.trim() ?? "";
  if (signName && signName.length > 20) {
    problems.push("TENCENT_SMS_SIGN_NAME: 不能超过 20 个字符");
  }

  const secretId = process.env.TENCENT_SMS_SECRET_ID?.trim() ?? "";
  if (secretId && secretId.length < 10) {
    problems.push("TENCENT_SMS_SECRET_ID: 长度明显不足");
  }

  const secretKey = process.env.TENCENT_SMS_SECRET_KEY?.trim() ?? "";
  if (secretKey && secretKey.length < 10) {
    problems.push("TENCENT_SMS_SECRET_KEY: 长度明显不足");
  }

  return problems;
}

// ------------------------------------------------------------
// 代理 IP 信任边界
// ------------------------------------------------------------

/** 反向代理 IP / CIDR（逗号分隔）；用于解析多级 X-Forwarded-For */
export function trustedProxyCidrs(): string[] {
  return (process.env.TRUSTED_PROXY_CIDRS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const IP_HEADER_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** 这些头永远不能当作客户端 IP 来源（值是凭据或与来源无关） */
const FORBIDDEN_IP_HEADERS = new Set([
  "authorization",
  "cookie",
  "proxy-authorization",
  "host",
  "content-length",
  "content-type",
  "user-agent",
  "referer",
]);

export type CidrCheck = { ok: true; family: 4 | 6; prefix: number } | { ok: false; reason: string };

/**
 * 校验 IP / CIDR 写法。只做语法与范围检查，不依赖 node:net，
 * 这样在 Workers 运行时（没有完整 node 网络模块）也能安全调用。
 */
export function checkCidr(value: string): CidrCheck {
  const raw = value.trim();
  if (!raw) return { ok: false, reason: "不能为空" };

  const slash = raw.lastIndexOf("/");
  const address = slash === -1 ? raw : raw.slice(0, slash);
  const prefixPart = slash === -1 ? null : raw.slice(slash + 1);

  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(address);
  if (v4) {
    if (v4.slice(1).some((octet) => Number(octet) > 255)) {
      return { ok: false, reason: "IPv4 段超过 255" };
    }
    const prefix = prefixPart === null ? 32 : Number(prefixPart);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
      return { ok: false, reason: "IPv4 前缀必须是 0–32 的整数" };
    }
    return { ok: true, family: 4, prefix };
  }

  if (!address.includes(":") || !/^[0-9a-fA-F:]+$/.test(address)) {
    return { ok: false, reason: "既不是 IPv4 也不是 IPv6" };
  }
  if (address.split("::").length > 2) return { ok: false, reason: "IPv6 最多只能出现一处 ::" };

  const [leftPart, rightPart] = address.split("::");
  const left = leftPart ? leftPart.split(":") : [];
  const right = rightPart === undefined ? [] : rightPart ? rightPart.split(":") : [];
  const groups = [...left, ...right];
  if (groups.some((group) => group.length === 0 || group.length > 4)) {
    return { ok: false, reason: "IPv6 分组不合法" };
  }
  const total = groups.length;
  if (rightPart === undefined ? total !== 8 : total > 7) {
    return { ok: false, reason: "IPv6 分组数量不合法" };
  }

  const prefix = prefixPart === null ? 128 : Number(prefixPart);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 128) {
    return { ok: false, reason: "IPv6 前缀必须是 0–128 的整数" };
  }
  return { ok: true, family: 6, prefix };
}

/** 客户端 IP 的来源判定方式 */
export type IpTrustMode = "explicit-header" | "trusted-proxy" | "unconfigured";

export type IpTrustConfig = {
  mode: IpTrustMode;
  /** 交给 Better Auth 的 ipAddressHeaders；空数组表示「不信任任何请求头」 */
  headers: string[];
  trustedProxies: string[];
};

/**
 * 决定「凭什么相信这个 IP」。
 *
 * Better Auth 1.7 的行为（`@better-auth/core/utils/ip`）：
 * - 配置了 `trustedProxies` 时，X-Forwarded-For 从右往左跳过可信代理，取第一个不可信跳；
 * - 没有 `trustedProxies` 时，只信任「单值」请求头，多值一律返回 null。
 *
 * 因此：
 * - 显式 `TRUSTED_IP_HEADERS` → 只读这些头（部署方保证代理会覆盖它们）；
 * - 只配 `TRUSTED_PROXY_CIDRS` → 只用 X-Forwarded-For，右侧解析，最安全；
 * - 两者都没配：
 *   - 生产环境 → 不信任任何头（`headers: []`），并在启动自检里拒绝启动。
 *     绝不「猜」客户端 IP：单值头是客户端可以直接伪造的。
 *   - 开发 / 测试 → 保留 x-real-ip → x-forwarded-for，方便本地与 CI 指定来源。
 */
export function ipTrustConfig(envName: AppEnv = appEnv): IpTrustConfig {
  const proxies = trustedProxyCidrs();
  const raw = process.env.TRUSTED_IP_HEADERS?.trim();

  if (raw) {
    const headers = raw
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    return { mode: "explicit-header", headers, trustedProxies: proxies };
  }
  if (proxies.length > 0) {
    // 有可信代理时只认 XFF：此时再读单值 x-real-ip 反而会绕过右侧解析
    return { mode: "trusted-proxy", headers: ["x-forwarded-for"], trustedProxies: proxies };
  }
  if (envName === "production") {
    return { mode: "unconfigured", headers: [], trustedProxies: [] };
  }
  return {
    mode: "explicit-header",
    headers: ["x-real-ip", "x-forwarded-for"],
    trustedProxies: [],
  };
}

/** 读取客户端 IP 的请求头顺序（兼容旧调用点） */
export function ipAddressHeaders(envName: AppEnv = appEnv): string[] {
  return ipTrustConfig(envName).headers;
}

// ------------------------------------------------------------
// 生产环境配置校验
// ------------------------------------------------------------

export type ConfigProblem = { key: string; message: string };

/**
 * 列出生产环境的配置问题。读取 process.env，方便单测覆盖。
 * 返回值只包含变量名与原因，不包含任何密钥内容。
 */
export function collectConfigProblems(envName: AppEnv = appEnv): ConfigProblem[] {
  if (envName !== "production") return [];

  const problems: ConfigProblem[] = [];
  const add = (key: string, message: string) => problems.push({ key, message });

  const secret = process.env.BETTER_AUTH_SECRET?.trim() ?? "";
  if (!secret) add("BETTER_AUTH_SECRET", "必须配置会话与隐私 Cookie 的签名密钥");
  else {
    const check = checkAuthSecret(secret);
    if (!check.ok) add("BETTER_AUTH_SECRET", `${check.reason}（建议 openssl rand -base64 32）`);
  }

  const authUrl = process.env.BETTER_AUTH_URL?.trim() ?? "";
  if (!authUrl) add("BETTER_AUTH_URL", "必须配置生产域名，例如 https://example.com");
  else {
    const check = checkUrl(authUrl, { requireHttps: true });
    if (!check.ok) add("BETTER_AUTH_URL", check.reason);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() ?? "";
  if (!appUrl) add("NEXT_PUBLIC_APP_URL", "必须配置邀请链接使用的站点地址");
  else {
    const check = checkUrl(appUrl, { requireHttps: true });
    if (!check.ok) add("NEXT_PUBLIC_APP_URL", check.reason);
  }

  const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
  if (!databaseUrl) add("DATABASE_URL", "必须配置数据库连接串");
  else if (!isPostgresUrl(databaseUrl)) {
    add("DATABASE_URL", "必须是合法的 PostgreSQL 连接串（postgres:// 或 postgresql://，含主机与库名）");
  }

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
    } else {
      for (const message of checkTencentFormats()) {
        const [key, ...rest] = message.split(":");
        add(key.trim(), rest.join(":").trim());
      }
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

  // ---- 客户端 IP 信任边界（IP 限流的前提）----
  const trust = ipTrustConfig(envName);
  if (trust.mode === "unconfigured") {
    add(
      "TRUSTED_IP_HEADERS",
      "必须显式声明可信的客户端 IP 来源，否则无法安全限流：" +
        "平台会覆盖请求头时设 TRUSTED_IP_HEADERS=x-real-ip（Vercel）或 cf-connecting-ip（Cloudflare）；" +
        "代理会追加 X-Forwarded-For 时设 TRUSTED_PROXY_CIDRS=<代理网段>。",
    );
  } else {
    for (const header of trust.headers) {
      if (!IP_HEADER_NAME.test(header)) {
        add("TRUSTED_IP_HEADERS", `非法的请求头名：${header}`);
      } else if (FORBIDDEN_IP_HEADERS.has(header)) {
        add("TRUSTED_IP_HEADERS", `不能把 ${header} 当作客户端 IP 来源`);
      }
    }
    if (trust.headers.length === 0) {
      add("TRUSTED_IP_HEADERS", "不能为空；至少声明一个可信的客户端 IP 请求头");
    }
  }

  for (const proxy of trust.trustedProxies) {
    const check = checkCidr(proxy);
    if (!check.ok) {
      add("TRUSTED_PROXY_CIDRS", `"${proxy}" 不是合法的 IP / CIDR：${check.reason}`);
    } else if (check.prefix === 0) {
      add(
        "TRUSTED_PROXY_CIDRS",
        `"${proxy}" 覆盖全部地址，等于信任任何来源，请写入真实的代理网段`,
      );
    }
  }

  return problems;
}

/**
 * 非致命的配置提醒（不会阻止启动）。
 * 只列「配置合法但很可能没达到预期」的情况，避免把真正的错误稀释掉。
 */
export function collectConfigWarnings(envName: AppEnv = appEnv): string[] {
  if (envName !== "production") return [];
  const warnings: string[] = [];
  const trust = ipTrustConfig(envName);

  if (trust.mode === "explicit-header") {
    warnings.push(
      `已信任请求头 ${trust.headers.join(" / ")}：请确认反向代理会覆盖这些头（客户端可以自行设置），` +
        "否则伪造该头即可换一个限流桶。",
    );
    if (trust.headers.includes("x-forwarded-for") && trust.trustedProxies.length === 0) {
      warnings.push(
        "TRUSTED_IP_HEADERS 含 x-forwarded-for 但没有配置 TRUSTED_PROXY_CIDRS：" +
          "代理追加多级地址时 Better Auth 会拒绝解析并退化为共享桶（所有用户共用一个 IP 配额）。" +
          "若代理只是覆盖单值可以忽略；否则请配置可信代理网段。",
      );
    }
  }

  for (const proxy of trust.trustedProxies) {
    const check = checkCidr(proxy);
    if (!check.ok) continue;
    const tooBroad =
      (check.family === 4 && check.prefix < 8) || (check.family === 6 && check.prefix < 16);
    if (tooBroad) {
      warnings.push(
        `TRUSTED_PROXY_CIDRS 中的 "${proxy}" 覆盖范围过大，可能把普通客户端也当成可信代理；` +
          "这不会直接放行请求，但会让 IP 解析退化为共享桶。",
      );
    }
  }

  return warnings;
}

export class ProductionConfigError extends Error {
  readonly problems: ConfigProblem[];

  constructor(problems: ConfigProblem[]) {
    super(
      [
        "生产环境配置检查未通过，服务已拒绝启动：",
        ...problems.map((item) => `  - ${item.key}: ${item.message}`),
        "本地演示/CI 请设置 APP_ENV=test；真实部署请补齐上述配置。",
        "注意：NEXT_PUBLIC_* 变量在构建期已内联进产物，运行时修改无效；" +
          "若问题出在这类变量上，请在构建时配置正确后重新构建。",
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
