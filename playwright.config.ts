import { defineConfig, devices } from "@playwright/test";

const APP_PORT = Number(process.env.E2E_APP_PORT ?? 3100);
const DB_PORT = Number(process.env.E2E_DB_PORT ?? 55440);

/**
 * E2E 配置。
 *
 * 前置：先 `npm run build`（Playwright 的 webServer 只负责起库和服务，不负责构建）。
 * 数据库是独立的 `.localdb-e2e`，每个测试用新手机号注册，互不干扰。
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // 共用一个数据库，串行执行更好定位失败；单个用例内部仍然是完整浏览器流程
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${APP_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node scripts/e2e-db.mjs",
      port: DB_PORT,
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "node scripts/e2e-app.mjs",
      url: `http://127.0.0.1:${APP_PORT}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
