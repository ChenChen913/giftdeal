/**
 * 一条命令起本地环境：演示数据库 + Next 开发服务。
 *   npm run dev:local
 */
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const children = [];

// Next 自己打印的 "Network:" 可能选中 VMware 等虚拟网卡地址，容易误导。
// 这里列出全部非回环 IPv4，让手机访问时挑与手机同一 Wi-Fi 的那个。
const port = process.env.PORT ?? "3000";
const lanUrls = Object.values(os.networkInterfaces())
  .flatMap((list) => list ?? [])
  .filter((net) => net.family === "IPv4" && !net.internal && !net.address.startsWith("169.254."))
  .map((net) => `http://${net.address}:${port}`);
console.log(
  `[dev] 本机 http://localhost:${port}；局域网地址（选与手机同一 Wi-Fi 的那个）：${lanUrls.join("  ") || "无"}`,
);

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
