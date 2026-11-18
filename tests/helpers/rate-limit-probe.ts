/**
 * 供「多实例共享限流」测试使用的探针进程。
 *
 * 父进程已经消耗完某个 IP 的配额；这里在独立进程中重新加载 auth，
 * 用同一个数据库再发一次请求，期望得到 429 —— 证明限流状态不依赖进程内存。
 *
 * 用法：node --import tsx tests/helpers/rate-limit-probe.ts <ip> <phone>
 */
import { auth } from "@/server/auth";

const [ip, phone] = process.argv.slice(2);

const response = await auth.handler(
  new Request("http://localhost:3000/api/auth/phone-number/send-otp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-real-ip": ip ?? "127.0.0.1",
    },
    body: JSON.stringify({ phoneNumber: phone ?? "+8613800000999" }),
  }),
);

console.log(`PROBE_STATUS=${response.status}`);
process.exit(0);
