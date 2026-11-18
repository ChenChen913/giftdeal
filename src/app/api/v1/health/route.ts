import { sql } from "drizzle-orm";

import { db } from "@/server/db-drizzle";
import { appEnv, isTestBuildRuntime } from "@/server/env";
import { handle } from "@/server/http/route";

/**
 * 健康检查同时暴露「运行环境」与「构建类型」，方便运维确认线上跑的是哪一份产物：
 * - env=production + build=production 才是正式生产；
 * - build=test 说明部署的是 CI/E2E 产物，必须立刻替换。
 * 这两个字段不含任何密钥，泄露风险可忽略，收益是能立刻发现误部署。
 */
export async function GET(req: Request) {
  return handle(req, async () => {
    await db.execute(sql`SELECT 1`);
    return {
      status: "ok",
      db: "up",
      env: appEnv,
      build: isTestBuildRuntime ? "test" : "production",
      time: new Date().toISOString(),
    };
  });
}
