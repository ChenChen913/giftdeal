/**
 * 发一条测试短信，验证腾讯云配置是否可用。
 *
 * 用法：
 *   npx tsx scripts/send-test-sms.ts 13800000001
 *
 * 会真的发一条短信（约 0.045 元）。配置从 .env 读取，
 * 需要 TENCENT_SMS_SECRET_ID / SECRET_KEY / SDK_APP_ID / SIGN_NAME / TEMPLATE_ID 齐全。
 */
import "dotenv/config";

import { TencentSmsProvider } from "../src/server/otp/tencent";

async function main() {
  const input = process.argv[2]?.trim();

  if (!input || !/^1[3-9]\d{9}$/.test(input)) {
    console.error("用法：npx tsx scripts/send-test-sms.ts 13800000001");
    process.exit(1);
  }

  const provider = new TencentSmsProvider();
  const code = String(Math.floor(100000 + Math.random() * 900000));

  console.log(`正在向 +86${input} 发送测试验证码 ${code} …`);
  await provider.send(`+86${input}`, code);
  console.log("已提交，检查手机是否收到。没收到就看腾讯云控制台的发送记录与错误码。");
}

main().catch((error: unknown) => {
  console.error("发送失败：", error instanceof Error ? error.message : error);
  process.exit(1);
});
