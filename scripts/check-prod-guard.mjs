#!/usr/bin/env node
/**
 * 反向验证：生产构建 + APP_ENV=test 必须拒绝启动。
 *
 * 用法（需要先 npm run build，且构建时没有 NEXT_PUBLIC_E2E_BUILD=1）：
 *   node scripts/check-prod-guard.mjs
 *
 * 判定：
 * - 输出出现「NODE_ENV=production 下只允许 APP_ENV=production」→ 通过
 * - 否则启动成功 / 超时 / 报其他错 → 失败
 *
 * 说明：Next 在 instrumentation 抛错后会打印 "Failed to preload entries"，
 * 但进程可能继续保持存活，所以不能只依赖退出码。
 */
import { spawn } from "node:child_process";
import path from "node:path";

const PORT = Number(process.env.PROD_GUARD_PORT ?? 3210);
const TIMEOUT_MS = 45_000;
const REFUSAL = /NODE_ENV=production 下只允许 APP_ENV=production/;
const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");

const env = {
  ...process.env,
  NODE_ENV: "production",
  APP_ENV: "test",
  PORT: String(PORT),
  SMS_PROVIDER: "mock",
  OTP_ALLOW_FIXED_CODE: "true",
};

console.log(`[prod-guard] 启动 next start :${PORT}（APP_ENV=test）…`);

const child = spawn(process.execPath, [nextBin, "start", "-p", String(PORT)], {
  env,
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
let finished = false;
let poll;

const collect = (chunk) => {
  const text = chunk.toString();
  output += text;
  process.stdout.write(text);
};

child.stdout.on("data", collect);
child.stderr.on("data", collect);

function finish(passed, reason) {
  if (finished) return;
  finished = true;
  clearTimeout(timeout);
  clearInterval(poll);
  if (!child.killed) child.kill("SIGTERM");
  if (passed) {
    console.log(`\n[prod-guard] 通过：${reason}`);
    process.exit(0);
  }
  console.error(`\n[prod-guard] 失败：${reason}`);
  process.exit(1);
}

const timeout = setTimeout(() => {
  if (REFUSAL.test(output)) finish(true, "生产构建拒绝以 APP_ENV=test 启动");
  else finish(false, "45 秒内没有出现拒绝提示，疑似启动了测试模式");
}, TIMEOUT_MS);

// Next 抛错后进程可能不退出，轮询输出即可
poll = setInterval(() => {
  if (REFUSAL.test(output)) finish(true, "生产构建拒绝以 APP_ENV=test 启动");
}, 300);

child.on("exit", (code) => {
  if (REFUSAL.test(output)) finish(true, `生产构建拒绝启动（exit=${code}）`);
  else finish(false, `进程退出但未出现 APP_ENV 拒绝提示（exit=${code}）`);
});
