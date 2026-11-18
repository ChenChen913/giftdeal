/**
 * 数据库入口（Node 运行时）。
 *
 * 所有服务层统一从这里拿 `db`，不要直接 import 具体驱动：
 * - Node（本地 / Vercel / 自建）：db-pg.ts（node-postgres）
 * - Cloudflare Workers：构建时由 next.config.ts 别名到 db-neon.ts（Neon WebSocket）
 *
 * 两者导出同名 `db`，服务层代码零差异。
 */
export { db } from "./db-pg";
