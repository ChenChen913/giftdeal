/**
 * 短信验证码通道。
 *
 * 环境策略（详见 server/env.ts）：
 * - development：默认 mock，验证码打日志、固定码可用，方便本地联调
 * - test：CI / 冒烟 / E2E 用 mock + 固定码，但日志不打印验证码
 * - production：
 *   - 必须显式配置 SMS_PROVIDER=tencent（或后续新增的真实通道）
 *   - 禁止 mock：缺失配置直接抛错，由接口返回失败，绝不静默降级
 *   - 永不输出验证码
 *
 * provider 采用懒加载：模块导入不触发校验，避免 `next build` 阶段因为
 * 缺少运行时密钥而构建失败；真正的失败发生在第一次使用或启动自检时。
 */

import {
  appEnv,
  ConfigError,
  fixedOtpCode,
  fixedOtpCodeEnabled,
  isProduction,
  smsProviderName,
  type AppEnv,
} from "../env";
import { TencentSmsProvider } from "./tencent";

export interface OtpProvider {
  readonly name: string;
  send(phoneNumber: string, code: string): Promise<void>;
}

/** +8613800000001 → 138****0001，日志里不出现完整号码 */
export function maskPhoneForLog(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return "***";
  const local = digits.slice(-11);
  return `${local.slice(0, 3)}****${local.slice(-4)}`;
}

class MockOtpProvider implements OtpProvider {
  readonly name = "mock";

  async send(phoneNumber: string, code: string): Promise<void> {
    // 生产环境根本不会构造这个 provider（createOtpProvider 会抛错）；
    // 这里再兜一层：只有开发环境才把验证码写进日志。
    if (isProduction) {
      console.warn(`[OTP][mock] 拒绝在生产环境发送验证码（${maskPhoneForLog(phoneNumber)}）`);
      throw new Error("生产环境不可使用 mock 短信通道");
    }

    const suffix = process.env.NODE_ENV === "development" ? ` -> ${code}` : " -> ******";
    console.log(`[OTP][mock] ${maskPhoneForLog(phoneNumber)}${suffix}`);
  }
}

let cached: OtpProvider | null = null;

/** 按当前环境创建通道；生产环境配了 mock 会直接抛错（不会静默降级） */
export function createOtpProvider(envName: AppEnv = appEnv): OtpProvider {
  const provider = smsProviderName(envName);

  switch (provider) {
    case "mock":
      if (envName === "production") {
        throw new ConfigError(
          "SMS_PROVIDER",
          "生产环境禁止使用 mock 短信通道：验证码无法送达。请配置 SMS_PROVIDER=tencent",
        );
      }
      return new MockOtpProvider();
    case "tencent":
      return new TencentSmsProvider();
    default:
      throw new ConfigError("SMS_PROVIDER", `未知的 SMS_PROVIDER: ${provider}`);
  }
}

/** 懒加载单例：第一次真正发短信时才校验配置 */
export function getOtpProvider(): OtpProvider {
  if (!cached) cached = createOtpProvider();
  return cached;
}

/** 仅供测试：重置单例，避免环境变量切换后拿到旧实例 */
export function resetOtpProviderForTests(): void {
  cached = null;
}

/** 开发/测试环境的固定验证码；生产环境恒为 null */
export function fixedCodeForEnvironment(): string | null {
  if (!fixedOtpCodeEnabled()) return null;
  return fixedOtpCode();
}
