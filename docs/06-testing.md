# 06 · 测试策略与运行方式

> 本文只描述**当前代码**里真实存在的测试。数字以 `npm test` / `npm run smoke` / `npm run test:e2e` 的实际输出为准。

---

## 1. 三层测试

| 层 | 工具 | 跑什么 | 依赖 |
|---|---|---|---|
| 单元 | Node Test Runner + tsx | 日期、金额、遮罩、环境判定矩阵、密码/URL/密钥校验 | 无 |
| 服务层 | Node Test Runner + PGlite | 结清、预备并发、邀请、软删除、统计、限流、schema 一致性 | 临时 PGlite（自动起停） |
| 接口 | `scripts/smoke.mjs` | 真实 HTTP 契约（登录 → 记账 → 结清 → 邀请 → 隐私） | 已迁移 + seed 的库 + 已启动服务 |
| 浏览器 | Playwright (Chromium) | 登录、记一笔、对账、结清、预备、邀请、移动端导航 | 生产构建 + 独立 PGlite |

---

## 2. 服务层测试怎么跑真实数据库

`tests/helpers/test-db.ts` 做三件事：

1. `PGlite.create()` 起一个进程内 Postgres（WASM），等内核 ready；
2. `pglite-server` 在随机端口暴露标准 Postgres 协议；
3. 把 `process.env.DATABASE_URL` 指过去，按顺序执行 `prisma/migrations/*/migration.sql`。

因此服务层跑的是**真 SQL**：事务、唯一索引、部分索引、条件更新、`ON CONFLICT` 都是数据库在判断，不是 mock。

测试文件用动态 `import()` 加载服务：

```ts
const database = await startTestDatabase();
const { db } = await import("@/server/db-drizzle");
const recordService = await import("@/server/services/record.service");
```

静态 import 会在 `DATABASE_URL` 设置之前加载 `db-pg.ts`，导致连到错误的库。

### 已知限制：PGlite 是单会话内核

`pglite-server` 可以接受多个 TCP 连接，但事务并不隔离：连接 A 的 `rollback` 会影响连接 B 的写入。测试里把连接池锁成 1（`DB_POOL_MAX=1`），让事务串行执行：

- **能验证**：重复操作的条件更新、事务回滚（故障注入）、幂等性；
- **不能验证**：真正多连接并发下的锁竞争与隔离级别。

生产数据库（Postgres / Neon）支持完整并发；服务层的防重逻辑依赖 `WHERE settled_at IS NULL`、`WHERE status = 'PLANNED'` 这类条件更新，在真实并发下由行锁保证只有一个请求成功。这一点在代码层可审查，但本地没有真实多连接环境复现。

---

## 3. 覆盖矩阵

### 3.1 礼金与结清（`tests/record-settlement.test.ts`）

| 场景 | 断言 |
|---|---|
| 新增收礼 | 未结清、待回礼 1 笔 / 金额正确 |
| 手动结清 | `settledAt` 有值、`settledByRecordId` 为空 |
| 取消结清 | 回到未结清，重复取消报 `RECORD_NOT_SETTLED` |
| 关联结清 | 送出记录落库，收礼 `settledByRecordId` 指向它 |
| 重复结清 | `RECORD_ALREADY_SETTLED`，且不会多出送出记录 |
| 送出记录不能结清 | `RECORD_NOT_SETTLEABLE` |
| 删除用于结清的送出记录 | 收礼回退未结清、待回礼恢复（**修复过的 bug**） |
| 删除被结清的收礼 | 送出记录保留，反向引用断开 |
| 两个请求同时结清 | 一个成功、一个 `RECORD_ALREADY_SETTLED` |
| 并发用两笔送出结清同一收礼 | 只落一条送出记录 |
| 跨账本结清 / 读取 | `SETTLE_TARGET_INVALID` / `NOT_FOUND` |
| 软删除后的统计 | 首页汇总、按人统计同步归零 |

### 3.2 人情预备（`tests/plan-completion.test.ts`）

| 场景 | 断言 |
|---|---|
| 创建 / 修改 / 删除 | 不计入收支；删除后列表消失 |
| 完成并生成记录 | 金额、方向、日期、`recordId` 关联正确 |
| 完成时改金额 | 使用实际金额 |
| 只标记完成 | `record = null`、`recordId = null` |
| 重复完成 | `CONFLICT`，记录数不增加 |
| 已完成不能再改 | `CONFLICT` |
| 完成时数据库异常 | 整笔回滚：预备仍 `PLANNED`、没有半条记录（临时 CHECK 约束注入故障） |
| 两个请求同时完成 | 一个成功、只生成一条记录 |
| 删除预备 | 已生成的真实记录保留；待办预备删除后不能完成 |
| 跨账本 | 改 / 删 / 完成均 `NOT_FOUND` |

### 3.3 邀请与成员（`tests/invite-membership.test.ts`）

| 场景 | 断言 |
|---|---|
| 创建邀请 | token 32 位 hex，状态 `PENDING` |
| 接受邀请 | 角色 `MEMBER`，成员数 +1 |
| 重复接受 | 幂等 `alreadyMember=true`，不重复入册 |
| 已是成员看新邀请 | `alreadyMember=true` |
| 过期 | `INVITE_EXPIRED` |
| 撤销 | 状态 `REVOKED`，接受报 `INVITE_REVOKED` |
| 两个用户同时接受 | 只有一个人成功，另一个 `INVITE_USED` |
| 普通成员撤销他人邀请 | `FORBIDDEN`；管理员可以 |
| 跨账本读写 | `NOT_FOUND` |

### 3.4 联系人与人生大事（`tests/contact-event.test.ts`）

| 场景 | 断言 |
|---|---|
| 软删除联系人 | 历史记录保留、仍计入统计；名录与详情不可见 |
| 已删除联系人 | 不能新增记录 / 预备 |
| 软删除记录 | 统计与按人汇总排除 |
| 同名联系人 | 创建 / 改名冲突；软删除后可重建同名 |
| 事件汇总 | 收 / 送 / 净额 / 参与人数正确 |
| 删除事件 | 记录解除关联但保留；事件不可见 |
| 跨账本 | 改 / 删事件、把记录挂到别人事件上均 `NOT_FOUND` |
| 事件列表 | 汇总排除已删记录 |

### 3.5 安全与配置

| 文件 | 覆盖 |
|---|---|
| `tests/env-guard.test.ts` | 环境判定矩阵（生产 + test 拒绝、构建阶段、测试构建、非法值）、URL/HTTPS、DATABASE_URL、密钥占位符、生产配置清单 |
| `tests/security-config.test.ts` | 密码强度、生产必填项、mock 短信 / 固定码 / admin / 局域网拦截、日志手机号打码 |
| `tests/log-redaction.test.ts` | 连接串 / 手机号 / 验证码 / SQL params 脱敏，超长截断 |
| `tests/privacy-lockout.test.ts` | 错误计数、5 次锁定、锁定时正确密码也拒绝、按用户隔离、Cookie 绑定用户 / 篡改无效、非法百分号编码不抛错、成功后清零 |
| `tests/throttle.test.ts` | 手机号键为 HMAC 摘要、窗口语义、并发计数、过期清理不误删有效窗口 |
| `tests/rate-limit.test.ts` | 同 IP 发送第 6 次 429、验证第 11 次 429、不同 IP 隔离、换 IP 不能绕过手机号冷却、多值 XFF 共享桶、跨进程共享计数、存储异常拒绝请求 |
| `tests/schema-consistency.test.ts` | Drizzle 与迁移后的真实库列名/可空性/默认值一致、关键唯一索引存在 |

### 3.6 E2E（`e2e/*.spec.ts`）

| 用例 | 覆盖 |
|---|---|
| 登录开通账本 | 手机号 + 固定码 + 协议勾选 → 默认账本 |
| 隐私模式 | 错误密码提示 → 正确解锁 → 真实金额 → 再次隐藏 |
| 错误验证码 | 不能登录 |
| 移动端导航 | 底栏切换、记一笔悬浮按钮 |
| 未登录跳转 | `/pending` → 登录 → 回到 `/pending` |
| 新增亲友 → 记收礼 → 对账 | 净差额与流水 |
| 关联结清 | 待回礼清空、详情显示已结清 |
| 人情预备 | 未来日期入预备 → 完成 → 生成真实记录 |
| 删除记录 | 列表与统计更新 |
| 家庭邀请 | 生成链接 → 新用户接受 → 读到共享数据 |
| 数据隔离 | 非成员访问返回 403 `LEDGER_FORBIDDEN` |

---

## 4. 运行方式

```bash
# 单元 + 服务层（自动起临时库，无需准备）
npm test

# 接口冒烟：先迁移 + seed + 起服务
npm run db:local &
npx prisma migrate deploy
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
npm run db:seed
npm run build:test && APP_ENV=test npm run start &
npm run smoke

# E2E：内部会构建测试产物（NEXT_PUBLIC_E2E_BUILD=1），不需要先 build
npm run test:e2e

# 反向验证：严格生产构建必须拒绝 APP_ENV=test
npm run build
npm run check:prod-guard
```

E2E 的隔离方式：

- 数据库：`.localdb-e2e`，每次运行前删除重建；
- 端口：应用 3100、数据库 55440，不碰本地开发环境；
- 账号：每个用例用新手机号注册，账本天然隔离；
- 短信：`APP_ENV=test` + 固定码，不调用真实通道；
- 构建：`NEXT_PUBLIC_E2E_BUILD=1` 在构建期内联，运行时无法把生产构建切换成测试模式；
- 失败产物：`test-results/`（截图 + trace），CI 会作为 artifact 上传。

---

## 5. CI

`.github/workflows/ci.yml` 两个 job：

1. `verify`：`npm ci` → `typecheck` → `npm test` → 严格 `build` → `check:prod-guard` → `build:test` → 起 PGlite + migrate + seed + start → `smoke`；
2. `e2e`：`npm ci` → 安装 Chromium → `build` → `test:e2e` → 失败时上传报告。

CI 显式设置 `APP_ENV=test`，但严格构建产物在运行时会拒绝 test：所以冒烟/E2E 使用带内联标记的 `build:test` 产物。真实生产（`APP_ENV=production`）会在启动自检阶段拒绝 mock 短信与固定验证码。

### 5.1 限流测试的边界

- 生产环境的 IP 来自 `x-real-ip` / `x-forwarded-for`。测试里直接构造请求头，验证的是「限流逻辑 + 数据库共享」；
- 实际防伪造依赖反向代理覆盖请求头。`TRUSTED_PROXY_CIDRS` 可解析多级代理链；未配置时多值头进入共享桶，不会为每个伪造 IP 开新桶；
- 手机号冷却不依赖 IP，是本项目对「换 IP 刷短信」的最终兜底。
