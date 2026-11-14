/**
 * 一条命令起本地环境：演示数据库 + Next 开发服务。
 *   npm run dev:local
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const children = [];

function run(label, command, args, env) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[dev] ${label} 退出，code=${code}`);
      shutdown(code);
    }
  });
  children.push(child);
  return child;
}

function shutdown(code = 0) {
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  process.exit(code);
}

run("db", process.execPath, [path.join(root, "scripts/dev-db.mjs")], []);
run("web", process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "dev"], []);

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
