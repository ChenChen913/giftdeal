#!/usr/bin/env node
/**
 * 生产 / 测试产物的反向校验矩阵。
 *
 * 用法（必须先构建对应产物）：
 *   NEXT_PUBLIC_APP_URL=https://your.domain npm run build && node scripts/check-prod-guard.mjs
 *     情况 A：生产构建 + APP_ENV=test         → 必须拒绝启动
 *     情况 B：生产构建 + APP_ENV=development  → 必须拒绝启动
 *     情况 C：生产构建 + APP_ENV=production + 完整配置 → 必须正常启动
 *
 * 前置：情况 C 要求「用生产域名构建」的产物。NEXT_PUBLIC_APP_URL 在构建期被内联，
 * 运行时注入的 https 值读不到；若用 http://localhost 构建，配置自检会正确地拒绝启动，
 * C 就会失败 —— 这不是代码缺陷，而是构建身份不对，需用正确域名重新构建。
 * CI 的「生产构建」步骤已单独注入 https 站点地址。
 *
 *   npm run build:test && node scripts/check-prod-guard.mjs test-build
 *     情况 D：测试构建 + APP_ENV=test         → 必须正常启动（E2E 路径）
 *     情况 E：测试构建 + APP_ENV=production   → 必须拒绝启动（产物身份不可混淆）
 *
 * 判定依据是启动日志里的明确文案，而不是退出码：Next 在 instrumentation 抛错后
 * 仍可能保持进程存活，只看退出码会漏判。
 */
import { spawn } from "node:child_process";
import path from "node:path";

const suite = process.argv[2] ?? "prod";
const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");

/**
 * 所有「拒绝启动」的明确文案。逐条对应 env.ts 里的防线：
 * - 生产配置缺项 / 非法 → ProductionConfigError
 * - NODE_ENV=production + APP_ENV=development → 下只允许 APP_ENV=production
 * - 测试构建 + APP_ENV=production → 只能以 APP_ENV=test 运行
 * - 生产构建 + APP_ENV=test（含 NODE_ENV 缺失）→ APP_ENV=test 只允许…生产构建禁止进入测试模式
 *   （这条防线判定更早，不能用旧的 NODE_ENV 分支文案来匹配）
 *
 * 只认这些明确文案，不认退出码/空输出，避免「因为别的原因崩了」被误判为通过。
 */
const REFUSE_ENV =
  /生产环境配置检查未通过|下只允许 APP_ENV=production|只能以 APP_ENV=test 运行|APP_ENV=test 只允许|生产构建禁止进入测试模式/;
const BOOT_PRODUCTION = /\[boot\] 生产环境配置检查通过/;
const BOOT_TEST_BUILD = /测试构建（NEXT_PUBLIC_E2E_BUILD=1）/;

/** 生产环境的完整合法配置（真实部署时换成真实值） */
const validProductionEnv = {
  APP_ENV: "production",
  NODE_ENV: "production",
  BETTER_AUTH_URL: "https://giftdeal.example.com",
  NEXT_PUBLIC_APP_URL: "https://giftdeal.example.com",
  BETTER_AUTH_SECRET: "Q7mS3nY8vK2pR9tW4xZ6bC1dF5gH0jL3",
  PRIVACY_PASSWORD: "Prod-Privacy-2026",
  DATABASE_URL: "postgresql://giftdeal:secret@127.0.0.1:1/giftdeal",
  SMS_PROVIDER: "tencent",
  TENCENT_SMS_SECRET_ID: "AKIDexample0000000000",
  TENCENT_SMS_SECRET_KEY: "examplekey0000000000000",
  TENCENT_SMS_SDK_APP_ID: "1400000000",
  TENCENT_SMS_SIGN_NAME: "礼金账本",
  TENCENT_SMS_TEMPLATE_ID: "123456",
  TRUSTED_IP_HEADERS: "x-real-ip",
  OTP_ALLOW_FIXED_CODE: "false",
  ALLOW_ADMIN_LOGIN: "false",
  ALLOW_LAN_ACCESS: "false",
};

/**
 * 运行时环境不能从当前 shell 继承（本地 .env、CI 的 job env 都会干扰），
 * 只保留启动 Next 必需的系统变量。
 */
function baseEnv() {
  const keep = ["PATH", "SystemRoot", "ComSpec", "TEMP", "TMP", "HOME", "USERPROFILE", "PATHEXT", "WINDIR"];
  const env = {};
  for (const key of keep) if (process.env[key] !== undefined) env[key] = process.env[key];
  // 显式写成 undefined 的变量表示「不注入」，不能变成字符串 "undefined"
  return Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined));
}

function spawnEnv(overrides) {
  const merged = { ...baseEnv(), ...overrides };
  return Object.fromEntries(Object.entries(merged).filter(([, value]) => value !== undefined));
}

/**
 * @param {{name: string, env: Record<string,string|undefined>, expect: "refuse"|"boot", marker: RegExp, timeoutMs?: number}} options
 */
function runCase(options) {
  const { name, env, expect, marker, timeoutMs = 60_000 } = options;
  const port = env.PORT ?? "3210";

  return new Promise((resolve) => {
    console.log(`\n[prod-guard] ${name}（:${port}，期望 ${expect === "refuse" ? "拒绝启动" : "正常启动"}）`);

    const child = spawn(process.execPath, [nextBin, "start", "-p", port], {
      env: spawnEnv(env),
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    let done = false;

    const stop = (ok, reason) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearInterval(poll);
      if (!child.killed) child.kill("SIGTERM");
      const label = ok ? "通过" : "失败";
      console.log(`[prod-guard] ${label}：${name} — ${reason}`);
      resolve({ ok, name, reason, output });
    };

    const collect = (chunk) => {
      output += chunk.toString();
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);

    const timer = setTimeout(() => {
      if (expect === "boot") stop(false, `${timeoutMs}ms 内没有出现启动成功标记`);
      else stop(REFUSE_ENV.test(output), "超时未出现拒绝提示");
    }, timeoutMs);

    const poll = setInterval(() => {
      if (marker.test(output)) {
        stop(true, expect === "refuse" ? "已被拒绝" : "已正常启动");
      }
    }, 250);

    child.on("exit", (code) => {
      if (done) return;
      if (marker.test(output)) {
        stop(true, `进程退出（code=${code}），但已出现预期标记`);
        return;
      }
      if (expect === "refuse") {
        // 拒绝启动时进程可能直接非零退出，也可能只打印错误后卡住；
        // 非零退出也接受，但必须看到明确文案，避免「因为别的原因崩了」被误判为通过
        stop(REFUSE_ENV.test(output), `进程退出 code=${code}，未见拒绝文案`);
      } else {
        stop(false, `进程提前退出 code=${code}`);
      }
    });
  });
}

const suites = {
  prod: [
    {
      name: "A. 生产构建 + APP_ENV=test",
      env: { ...validProductionEnv, APP_ENV: "test", PORT: "3210" },
      expect: "refuse",
      marker: REFUSE_ENV,
    },
    {
      name: "B. 生产构建 + APP_ENV=development",
      env: { ...validProductionEnv, APP_ENV: "development", PORT: "3211" },
      expect: "refuse",
      marker: REFUSE_ENV,
    },
    {
      /**
       * `next start` 自己会补 NODE_ENV=production，所以这里验证的是
       * 「即使调用方没显式设置 NODE_ENV，生产构建也不会进入 test」。
       */
      name: "B2. 生产构建 + APP_ENV=test（调用方未设置 NODE_ENV）",
      env: { ...validProductionEnv, APP_ENV: "test", NODE_ENV: undefined, PORT: "3212" },
      expect: "refuse",
      marker: REFUSE_ENV,
    },
    {
      name: "C. 生产构建 + APP_ENV=production + 完整配置",
      env: { ...validProductionEnv, PORT: "3213" },
      expect: "boot",
      marker: BOOT_PRODUCTION,
    },
  ],
  "test-build": [
    {
      name: "D. 测试构建 + APP_ENV=test",
      env: {
        ...validProductionEnv,
        APP_ENV: "test",
        BETTER_AUTH_URL: "http://127.0.0.1:3214",
        NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3214",
        SMS_PROVIDER: "mock",
        OTP_ALLOW_FIXED_CODE: "true",
        PORT: "3214",
      },
      expect: "boot",
      marker: BOOT_TEST_BUILD,
    },
    {
      name: "E. 测试构建 + APP_ENV=production（产物身份不可混淆）",
      env: { ...validProductionEnv, PORT: "3215" },
      expect: "refuse",
      marker: REFUSE_ENV,
    },
  ],
};

const cases = suites[suite];
if (!cases) {
  console.error(`[prod-guard] 未知的套件：${suite}（可选：${Object.keys(suites).join(" / ")}）`);
  process.exit(1);
}

const results = [];
for (const testCase of cases) {
  results.push(await runCase(testCase));
}

const failed = results.filter((result) => !result.ok);
console.log(
  `\n[prod-guard] ${suite}：${results.length - failed.length}/${results.length} 通过`,
);

if (failed.length > 0) {
  for (const result of failed) {
    console.error(`\n--- ${result.name} 输出 ---\n${result.output.slice(-2000)}`);
  }
  process.exit(1);
}
process.exit(0);
