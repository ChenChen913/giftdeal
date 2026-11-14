/**
 * 短信验证码通道。
 *
 * MVP 只有 mock 实现，行为由两个环境变量控制：
 * - SMS_PROVIDER=mock           使用 mock 通道（验证码打到日志）
 * - OTP_ALLOW_FIXED_CODE=true   开发/联调环境固定验证码为 OTP_MOCK_CODE
 *
 * 生产环境不要设置 OTP_ALLOW_FIXED_CODE，此时仍走 Better Auth 的真实随机码，
 * 只是没有真实短信通道，需要从服务端日志取码（刻意的降级，不做静默放行）。
 *
 * 将来接阿里云/腾讯云短信，只需实现 OtpProvider 并替换 createOtpProvider 的分支，
 * 业务代码零改动。
 */

import { TencentSmsProvider } from "./tencent";

export interface OtpProvider {
  readonly name: string;
  send(phoneNumber: string, code: string): Promise<void>;
}

let warnedAboutProductionMock = false;

class MockOtpProvider implements OtpProvider {
  readonly name = "mock";

  async send(phoneNumber: string, code: string): Promise<void> {
    console.log(`[OTP][mock] ${phoneNumber} -> ${code}`);

    if (process.env.NODE_ENV === "production" && !warnedAboutProductionMock) {
      warnedAboutProductionMock = true;
      console.warn(
        "[OTP] 生产环境正在使用 mock 短信通道：验证码只打印在服务端日志里，请尽快接入真实短信服务。",
      );
    }
  }
}

export const isMockOtpEnabled =
  (process.env.SMS_PROVIDER ?? "mock") === "mock" &&
  process.env.OTP_ALLOW_FIXED_CODE === "true";

export const mockOtpCode = process.env.OTP_MOCK_CODE?.trim() || "123456";

export function createOtpProvider(): OtpProvider {
  const provider = process.env.SMS_PROVIDER ?? "mock";

  switch (provider) {
    case "mock":
      return new MockOtpProvider();
    case "tencent":
      // 缺环境变量会在构造时直接抛错，让应用启动即失败，而不是等用户点「获取验证码」才暴露
      return new TencentSmsProvider();
    default:
      throw new Error(`未知的 SMS_PROVIDER: ${provider}`);
  }
}

export const otpProvider = createOtpProvider();
