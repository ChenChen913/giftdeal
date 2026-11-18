/**
 * Next.js 启动钩子。
 *
 * 生产环境在这里做一次「配置自检」：缺少隐私密码、仍在使用 mock 短信、
 * 打开了固定验证码 / admin 快捷登录 / 局域网白名单，都会让服务直接拒绝启动，
 * 而不是等用户点「获取验证码」时才发现配置不对。
 *
 * 为什么不在模块顶层直接校验：
 * - Next 在 `next build` 阶段也会加载路由模块，构建机通常没有运行时密钥；
 * - 放在 register 里只在「真正启动服务」时执行，构建不受影响。
 */

export async function register() {
  // Edge / workerd 运行时没有 node:crypto 的完整能力，配置校验只在 Node 侧做
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { assertProductionConfig, appEnv, collectConfigWarnings, isTestBuildRuntime } =
    await import("./server/env");

  if (isTestBuildRuntime) {
    console.warn(
      "[boot] 当前是测试构建（NEXT_PUBLIC_E2E_BUILD=1），仅用于 CI / E2E，禁止部署到生产环境",
    );
  }

  if (appEnv !== "production") return;

  try {
    assertProductionConfig();
    for (const warning of collectConfigWarnings()) {
      console.warn(`[boot] ${warning}`);
    }
    console.log("[boot] 生产环境配置检查通过");
  } catch (error) {
    console.error("\n" + (error instanceof Error ? error.message : String(error)) + "\n");
    throw error;
  }
}
