/**
 * 测试进程的环境基线。
 *
 * `@/server/env` 在模块求值时就会计算 `appEnv`；如果 NODE_ENV / APP_ENV 都没设置，
 * 它会按「环境识别不明确」安全失败。ESM 的 import 按源码顺序求值，
 * 所以需要这个模块作为第一个 import，把测试环境固定成 test。
 *
 * `npm test` 已经用 cross-env 设好；这里是为了让「单独跑某个测试文件」也能工作。
 */
const env = process.env as Record<string, string | undefined>;
env["APP_ENV"] = env["APP_ENV"] ?? "test";
env["NODE_ENV"] = env["NODE_ENV"] ?? "test";
