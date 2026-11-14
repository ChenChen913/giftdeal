/**
 * 腾讯云短信通道（SendSms / 2021-01-11）。
 *
 * 不引官方 SDK：TC3-HMAC-SHA256 签名用 node:crypto 手写即可，
 * 省掉一个几十 MB 的依赖，也不用跟着 SDK 升级。
 *
 * 需要的环境变量（缺任意一个都会在启动时直接报错，不会等到发短信才炸）：
 *   TENCENT_SMS_SECRET_ID      访问密钥 SecretId
 *   TENCENT_SMS_SECRET_KEY     访问密钥 SecretKey
 *   TENCENT_SMS_SDK_APP_ID     短信控制台的 SDK AppID，1400 开头
 *   TENCENT_SMS_SIGN_NAME      已审核通过的签名，如「礼金账本」
 *   TENCENT_SMS_TEMPLATE_ID    验证码模板 ID
 *   TENCENT_SMS_REGION         可选，默认 ap-guangzhou
 */

import { createHash, createHmac } from "node:crypto";

import type { OtpProvider } from "./index";

const ENDPOINT = "sms.tencentcloudapi.com";
const SERVICE = "sms";
const ACTION = "SendSms";
const VERSION = "2021-01-11";

type TencentSmsConfig = {
  secretId: string;
  secretKey: string;
  sdkAppId: string;
  signName: string;
  templateId: string;
  region: string;
};

function readConfig(): TencentSmsConfig {
  const secretId = process.env.TENCENT_SMS_SECRET_ID?.trim();
  const secretKey = process.env.TENCENT_SMS_SECRET_KEY?.trim();
  const sdkAppId = process.env.TENCENT_SMS_SDK_APP_ID?.trim();
  const signName = process.env.TENCENT_SMS_SIGN_NAME?.trim();
  const templateId = process.env.TENCENT_SMS_TEMPLATE_ID?.trim();
  const region = process.env.TENCENT_SMS_REGION?.trim() || "ap-guangzhou";

  const missing = [
    ["TENCENT_SMS_SECRET_ID", secretId],
    ["TENCENT_SMS_SECRET_KEY", secretKey],
    ["TENCENT_SMS_SDK_APP_ID", sdkAppId],
    ["TENCENT_SMS_SIGN_NAME", signName],
    ["TENCENT_SMS_TEMPLATE_ID", templateId],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`腾讯云短信缺少环境变量：${missing.join("、")}`);
  }

  return {
    secretId: secretId as string,
    secretKey: secretKey as string,
    sdkAppId: sdkAppId as string,
    signName: signName as string,
    templateId: templateId as string,
    region,
  };
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function hmacSha256(key: Buffer | string, input: string): Buffer {
  return createHmac("sha256", key).update(input, "utf8").digest();
}

export class TencentSmsProvider implements OtpProvider {
  readonly name = "tencent";
  private readonly config: TencentSmsConfig;

  constructor() {
    this.config = readConfig();
  }

  async send(phoneNumber: string, code: string): Promise<void> {
    const body = JSON.stringify({
      PhoneNumberSet: [phoneNumber],
      SmsSdkAppId: this.config.sdkAppId,
      SignName: this.config.signName,
      TemplateId: this.config.templateId,
      // 模板里只有一个变量 {1}，就是验证码
      TemplateParamSet: [code],
    });

    const timestamp = Math.floor(Date.now() / 1000);
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    const authorization = this.authorization(body, timestamp, date);

    const response = await fetch(`https://${ENDPOINT}`, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json; charset=utf-8",
        "X-TC-Action": ACTION,
        "X-TC-Timestamp": String(timestamp),
        "X-TC-Version": VERSION,
        "X-TC-Region": this.config.region,
      },
      body,
      signal: AbortSignal.timeout(8_000),
    });

    const payload = (await response.json()) as {
      Response?: {
        SendStatusSet?: { Code?: string; Message?: string }[];
        Error?: { Code?: string; Message?: string };
      };
    };

    const error = payload.Response?.Error;
    if (error) {
      throw new Error(`腾讯云短信调用失败：${error.Code ?? "UNKNOWN"} ${error.Message ?? ""}`);
    }

    const status = payload.Response?.SendStatusSet?.[0];
    if (!status || status.Code !== "Ok") {
      throw new Error(
        `腾讯云短信未送达：${status?.Code ?? "UNKNOWN"} ${status?.Message ?? ""}`,
      );
    }
  }

  /** 腾讯云 API 3.0 的 TC3-HMAC-SHA256 签名 */
  private authorization(body: string, timestamp: number, date: string): string {
    const canonicalRequest = [
      "POST",
      "/",
      "",
      "content-type:application/json; charset=utf-8",
      `host:${ENDPOINT}`,
      "",
      "content-type;host",
      sha256Hex(body),
    ].join("\n");

    const credentialScope = `${date}/${SERVICE}/tc3_request`;
    const stringToSign = [
      "TC3-HMAC-SHA256",
      String(timestamp),
      credentialScope,
      sha256Hex(canonicalRequest),
    ].join("\n");

    const secretDate = hmacSha256(`TC3${this.config.secretKey}`, date);
    const secretService = hmacSha256(secretDate, SERVICE);
    const secretSigning = hmacSha256(secretService, "tc3_request");
    const signature = createHmac("sha256", secretSigning)
      .update(stringToSign, "utf8")
      .digest("hex");

    return [
      `TC3-HMAC-SHA256 Credential=${this.config.secretId}/${credentialScope}`,
      "SignedHeaders=content-type;host",
      `Signature=${signature}`,
    ].join(", ");
  }
}
