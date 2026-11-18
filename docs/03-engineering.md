# 03 · 工程设计与实现

> 本文描述**当前代码**的结构与关键决策。历史实施过程不再保留在这里（提交记录可查）；功能状态见根目录 README。

---

## 1. 技术栈与关键决策

| 层 | 选型 | 版本 | 决策原因 |
|---|---|---|---|
| 框架 | Next.js App Router | 16.4 | 前后端同仓；Route Handlers 直接做 `/api/v1` |
| 语言 | TypeScript | 5.9 | 全量 strict；服务层与 DTO 共用类型 |
| 数据访问 | Drizzle ORM | 0.45 | 纯 TS、无 WASM；支持交互式事务 |
| 数据库 | PostgreSQL | 14+ | 金额整数、`DATE` 自然日、部分唯一索引 |
| 迁移 | Prisma Migrate | 7.10 | 只负责 DDL 与版本记录，运行时不加载 Prisma Client |
| 认证 | Better Auth | 1.7 | 手机号验证码插件 + 会话表 |
| 校验 | Zod | 4.6 | route 层解析，服务层收结构化的 `z.infer` |
| 测试 | Node Test Runner / Playwright | — | 服务层跑 PGlite；E2E 跑生产构建 |

### 1.1 为什么运行时是 Drizzle、迁移还是 Prisma

Prisma 7 的查询编译器是 WASM，Next 的 webpack 会拦截 `?module` 后缀，Cloudflare Workers 又禁止运行时编译 WASM，三者无法同时满足。Drizzle 是纯 TS，且保留了 `db.transaction(async (tx) => ...)` 的语义，所以运行时整体切到 Drizzle。

迁移仍用 Prisma Migrate，因为 `prisma migrate deploy` 的版本表、幂等、失败提示已经够用；重写一套 DDL 工具没有收益。**结论：Prisma Client 只被 `prisma/seed.ts` 使用，生成器必须用 `runtime = "nodejs"`。**

### 1.2 数据库驱动的运行时切换

| 运行时 | 文件 | 驱动 |
|---|---|---|
| Node（本地 / Vercel / 自建） | `src/server/db-pg.ts` | `pg`（node-postgres） |
| Cloudflare Workers | `src/server/db-neon.ts` | `@neondatabase/serverless`（WebSocket） |

服务层统一 `import { db } from "@/server/db-drizzle"`，该文件在 Node 下 re-export `db-pg`。Cloudflare 构建时，`next.config.ts` 用 `turbopack.resolveAlias` / `webpack.resolve.alias` 把这个路径指到 `db-neon.ts`，业务代码无感知。

> 为什么 Node 不用 Neon 驱动：PGlite 与普通 Postgres 只暴露标准 Postgres 协议，没有 Neon 的 WebSocket 代理，Neon 驱动连不上本地库。换成 `pg` 后本地开发、服务层测试、E2E 才能跑在真实 SQL 上。

---

## 2. 目录与分层

```
src/app/api/v1/**/route.ts     HTTP 层：解析参数、调用服务、包信封
src/server/guards/             会话校验、账本成员校验、角色校验
src/server/services/           业务逻辑（事务边界在这里）
src/server/validators/         Zod schema
src/server/schema.ts           Drizzle 表定义与关系
src/server/db-*.ts             连接层（按运行时切换）
src/server/http/               统一错误类型、信封、参数解析
```

调用链固定为：

```
route → requireLedgerContext/requireSession → service(ctx, input) → db
```

- route 不写 SQL，也不做业务判断；
- service 第一个参数统一是 `LedgerContext { userId, ledgerId, role }`；
- 所有查询都带 `ledgerId`（见下一节）。

---

## 3. 数据隔离：三道防线

### 第一道：路由层 guard

`requireLedgerContext(req)`：

1. `requireSession` → 没有会话返回 401；
2. 从 `X-Ledger-Id`（优先）或 `?ledgerId=` 取账本；
3. 查 `membership`：
   - 是成员 → 返回 `{ userId, ledgerId, role }`
   - 不是成员但账本存在 → 403 `LEDGER_FORBIDDEN`
   - 账本不存在 → 404 `LEDGER_NOT_FOUND`

路径里已带 `ledgerId` 的接口（`/ledgers/{id}`、transfer、members）用 `requireLedgerById`，避免请求头与路径冲突。

### 第二道：查询层强制 ledgerId

所有列表 / 单条查询都写成 `and(eq(table.ledgerId, ctx.ledgerId), ...)`。跨账本读取会得到空结果，再映射成 404，不泄露「这条数据存在但不属于你」。

### 第三道：写操作把 ledgerId 放进 WHERE

更新 / 软删除不只按主键，还带 `ledgerId` 与 `deletedAt IS NULL`：

```ts
.where(and(
  eq(contact.id, contactId),
  eq(contact.ledgerId, ctx.ledgerId),
  isNull(contact.deletedAt),
))
```

这样即使前置检查与写入之间发生并发删除，也不会把已删数据「写回来」。

### 已知例外

`requireOwner(ctx)` 只做角色判断，不再查库；调用方必须已经过 guard。

---

## 4. 认证流程

### 4.1 登录

Better Auth `phoneNumber` 插件：

1. `POST /api/auth/phone-number/send-otp` 生成 6 位码，存 `verification`（5 分钟有效）；
2. `sendOTP` 回调调用短信通道；**失败会向上抛**，接口返回错误，不会出现「提示已发送但没收到」；
3. `POST /api/auth/phone-number/verify` 校验通过后：
   - 首次登录自动建号（`signUpOnVerification`，邮箱用 `{phone}@phone.local` 占位）；
   - `databaseHooks.user.create.after` 调用 `bootstrapUser` 建默认账本 + OWNER 成员；
   - 建会话并下发 Cookie。

`bootstrapUser` 是幂等的：已有 `defaultLedgerId` 直接返回；并发时用 `update ... where default_ledger_id is null` 抢占，抢不到读回对方结果。极端并发下可能留下一个没人引用的账本，不影响功能。

### 4.2 短信通道

`src/server/otp/index.ts`：

| 环境 | 通道 | 固定验证码 |
|---|---|---|
| development | 默认 mock，日志打印验证码 | 允许（`OTP_ALLOW_FIXED_CODE`） |
| test | mock，日志只打 `******` | 允许 |
| production | 必须 `tencent`；mock 直接抛错 | 禁止（即使配了也不生效） |

- provider 懒加载：模块导入不校验，首次发送或启动自检时才失败，避免 `next build` 因缺运行时密钥而失败；
- 腾讯云实现零依赖：`node:crypto` 手写 TC3-HMAC-SHA256；
- 日志里的手机号统一打码（`138****0001`）。

### 4.3 多实例限流

- Better Auth 1.7 的 `rateLimit.storage = "database"`，计数存 `rate_limit` 表，适配器用乐观锁自增，多实例共享。
- 覆盖 `/phone-number/send-otp`（5 次 / 分钟 / IP）与 `/phone-number/verify`（10 次 / 分钟 / IP）。
- 手机号 60 秒冷却（`throttle` 表）不依赖 IP，换 IP 也不能绕过。
- 生产必须显式声明 IP 来源：`TRUSTED_IP_HEADERS`（代理覆盖单值头）或 `TRUSTED_PROXY_CIDRS`（代理追加多级 XFF）。未配置时 `ipAddressHeaders: []`，服务在启动自检阶段直接拒绝启动，绝不「猜」客户端 IP；只有开发 / 测试才默认读 `x-real-ip` → `x-forwarded-for`。
- 限流存储异常时会抛错（HTTP 层 500），不会静默放行。

### 4.4 内部账号

`admin` 登录只在非生产环境生效（`devOnlyFlag("ALLOW_ADMIN_LOGIN")`）；生产环境即使误配也会被启动自检拦下。密码只从 `ADMIN_LOGIN_PASSWORD` 读取，不回退默认值。

---

## 5. 环境配置与生产自检

唯一入口：`src/server/env.ts`。

```ts
resolveAppEnv(input)              // 纯函数；环境判定矩阵可单测
appEnv: "development" | "test" | "production"
isProduction / isTest / isDevelopment
envFlag(name) / devOnlyFlag(name, envName?)
rateLimitEnabled(envName?)        // 生产始终 true；测试可用 RATE_LIMIT_ENABLED 打开
privacyPassword(envName?)
smsProviderName(envName?)
fixedOtpCodeEnabled(envName?)
checkUrl / isPostgresUrl / checkAuthSecret
collectConfigProblems(envName?)   // 返回问题列表，纯函数便于测试
collectConfigWarnings(envName?)   // 不阻止启动的提醒（网段过大、请求头可能被伪造）
ipTrustConfig(envName?) / checkCidr()  // 客户端 IP 信任边界与 CIDR 语法校验
assertProductionConfig()          // 有问题直接抛 ProductionConfigError
```

### 5.1 环境判定：生产不可被降级

| NODE_ENV | APP_ENV | 构建标记 | 结果 |
|---|---|---|---|
| production | test | 无 | **拒绝启动** |
| production | development | 无 | **拒绝启动** |
| production | 未设置 / production | 无 | production |
| production | test | `NEXT_PUBLIC_E2E_BUILD=1` | test（仅测试构建） |
| test | test | 任意 | test |
| production | 任意 | 构建阶段 | production（构建不做运行时判断） |

- 测试标记由 `npm run build:test` 设置，`NEXT_PUBLIC_*` 会被 Next **内联进产物**；运行时再设置环境变量无效，因此不能成为生产后门。
- `next build` 阶段即使 `APP_ENV=test` 也按 production 生成产物；缺少运行时密钥不会导致构建失败（数据库连接串在构建期使用不会连接的占位串）。
- `npm run check:prod-guard` 用严格生产构建跑 A/B/B2/C 四种启动组合；加 `test-build` 参数再跑 D/E 两种（测试构建身份不可混淆）。C 用例要求产物是用 **https 生产域名**构建的，否则会被配置自检正确地拒绝 —— CI 的「生产构建」步骤单独注入了 `NEXT_PUBLIC_APP_URL=https://...`。
- `APP_ENV=test` 必须能证明来源：除 `NODE_ENV=test` 外，只有带 `NEXT_PUBLIC_E2E_BUILD=1` 内联标记的测试构建可以进入测试模式；`NODE_ENV` 缺失时同样拒绝，避免生产构建被改名降级。
- `NEXT_PUBLIC_*`（如 `NEXT_PUBLIC_APP_URL`）会被 Next 在构建时内联，运行时覆盖无效；生产构建必须在构建环境里配好。

生产启动时 `src/instrumentation.ts` 调用 `assertProductionConfig()`，检查：

- `BETTER_AUTH_SECRET`（≥32 字符）、`DATABASE_URL`、`BETTER_AUTH_URL`、`NEXT_PUBLIC_APP_URL`（后两者必须 https）
- `TRUSTED_IP_HEADERS` 或 `TRUSTED_PROXY_CIDRS`：至少声明一个可信 IP 来源；请求头名不能是 `cookie` / `authorization` 等凭据头，CIDR 非法或 `/0` 全网段会被拒绝，过大网段只警告
- `PRIVACY_PASSWORD`（≥8 位，非重复 / 连续 / 常见弱口令）
- `SMS_PROVIDER` 必须显式配置；为 `mock` 时报错；为 `tencent` 时检查 5 个必填变量
- 危险开关：`OTP_ALLOW_FIXED_CODE`、`ALLOW_ADMIN_LOGIN`、`ALLOW_LAN_ACCESS` 必须关闭

任何一项不通过，服务拒绝启动并打印完整问题列表。

> 所有 env 读取都集中在这个模块；`db-pg.ts` / `tencent.ts` 只通过它拿配置，避免不同模块各读一份导致不一致。

---

## 6. 隐私解锁

`src/server/privacy.ts`：

- Cookie 值 = `base64url(userId.exp).hmacSHA256(BETTER_AUTH_SECRET)`；
- 每次读取校验：签名（`timingSafeEqual`）、有效期（8 小时）、`userId` 与会话一致；
- 密码比较：先 SHA-256 再 `timingSafeEqual`，不泄露长度；
- 失败计数：`throttle` 表，5 次 / 60 秒，成功后清零；
- 生产环境密码策略由 `env.ts` 统一校验，不达标返回 `503 PRIVACY_UNAVAILABLE`。

`privacyStatus()` 只读不写，可以在任何 route 里调用（例如导出前检查）。

---

## 7. 错误处理

`AppError(code, details?, message?)` 携带错误码，`ERROR_STATUS` 映射 HTTP 状态，`DEFAULT_MESSAGES` 给默认文案。

- route 用 `handle(req, fn)` 包裹：成功 `{ ok: true, data }`，失败 `{ ok: false, error }`；
- Zod 错误自动转 `422 VALIDATION_ERROR` + `details.fieldErrors`；
- 唯一约束冲突（`23505` / `P2002`）转 `409 CONFLICT`；
- 未预期异常只记服务端日志，客户端统一「服务器开小差了」，不泄露堆栈 / SQL。

需要自定义 `Set-Cookie` 的接口（登录、隐私解锁）不用 `handle`，而是手写 try/catch + `toErrorResponse`，避免信封覆盖响应头。

---

## 8. 数据库迁移与种子

### 8.1 迁移

```bash
npx prisma migrate deploy     # 生产 / CI
npm run db:migrate            # 本地开发（会生成新迁移）
```

迁移目录：`prisma/migrations/<timestamp>_<name>/migration.sql`。已有的关键迁移：

| 迁移 | 内容 |
|---|---|
| `20261110000000_init` | 全部业务表 + 索引 + 联系人部分唯一索引 |
| `20261110160000_add_gift_plan` | 人情预备 |
| `20261114111500_add_life_event` | 人生大事 |
| `20261114130000_contact_groups` | 分组 key 归一化 |
| `20261118093000_throttle` | 限流计数表 |
| `20261118094500_updated_at_defaults` | 给 `updated_at` 补数据库默认值 |
| `20261118113000_rate_limit` | Better Auth 数据库限流表 |

**新增迁移时必须同时改两处 schema**：`prisma/schema.prisma`（DDL 真相）与 `src/server/schema.ts`（运行时查询）。两边不一致会导致「迁移成功但运行时查询报列不存在」。

### 8.2 种子

`prisma/seed.ts` 用 Prisma Client（nodejs runtime），固定 ID、幂等 upsert；`--reset` 会先清空全部业务数据。

```bash
npm run db:seed                 # 幂等
npx tsx prisma/seed.ts --reset  # 清空重建（破坏性）
```

生产环境默认拒绝执行 seed（`NODE_ENV=production` 且未显式 `ALLOW_SEED=true`）。

---

## 9. 前端结构

- **状态**：三个 Context（Auth / Ledger / Toast）+ 一个 RecordDialog Provider；没有引入 Redux / Zustand。
- **请求**：`src/lib/api.ts` 统一带 `X-Ledger-Id`、解包信封、401 广播；页面不直接 `fetch`。
- **隐私**：`usePrivacy()` 提供 `money / person / note` 三个遮罩函数；解锁状态来自 `/privacy/status`。
- **响应式**：桌面侧栏、平板图标轨、手机底部导航，靠 CSS 断点切换；组件本身不重复实现。
- **已知偏大的组件**：`record-dialog.tsx`（记一笔 + 转预备）、`ledger/page.tsx`（账本管理）。两者内部逻辑内聚，拆分收益有限，暂不重构。

---

## 10. 部署与运行时

### 10.1 Vercel + Neon（主线）

- Build：`npm run build`（`prisma generate` + `next build`）
- 运行时：`pg` 连接 `DATABASE_URL`（pooled 串）
- 迁移：在 CI / 本地执行 `npx prisma migrate deploy`，不要放进 Build Command
- 健康检查：`GET /api/v1/health` 会执行 `SELECT 1`

### 10.2 Cloudflare Workers（未验证）

`npm run cf:build` 会设置 `BUILD_TARGET=cloudflare`：

- `next.config.ts` 把数据库入口切到 `db-neon.ts`
- 关闭 `serverExternalPackages`，依赖打进 worker bundle
- 需要 Neon 的 WebSocket 连接串

本次工程审查未实际部署到 Workers，相关脚本保持原样，仅作为可选路径。

---

## 11. 维护性注意事项

- **金额**永远是整数「分」，展示层才转元；不要在 service 里出现浮点。
- **日期**：`occurredAt` / `expectedAt` 是 `DATE`，只表达自然日；解析一律 `split("-")`，禁止 `new Date("YYYY-MM-DD")`（时区会偏移一天）。
- **结清外键**在「收到」记录上（`settledByRecordId` 指向送出记录）。删除送出记录时必须反查 `settledByRecordId`，不能看当前行的 `settledRecord`。
- **事务**：涉及两条记录状态的操作（结清 / 删除 / 完成预备）必须在同一个 `db.transaction` 里，并用条件更新抢占。
- **索引**：新增按账本过滤的查询时，确认已有 `(ledger_id, ...)` 复合索引；目前 `record` / `contact` / `gift_plan` / `life_event` 的主查询路径都已覆盖。
- **统计**：`contact.stats` 是实时聚合，不落库；改统计口径只需改 `stats.service.ts`。
