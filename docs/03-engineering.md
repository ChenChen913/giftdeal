# 03 · 工程设计与实施计划

---

## 1. 技术选型（版本已核对，2026-11）

| 组件 | 版本 | 说明 |
|---|---|---|
| Next.js | 16.4.6 | App Router；Route Handler 的 `params` 是 **Promise**，必须 `await` |
| React | 19.x | Next 16 要求 |
| Prisma CLI / Client | **7.10.1（必须显式固定）** | npm 上 `prisma@latest` 目前指向 `8.0.0-rc`，而 Better Auth 的 Prisma adapter **尚不支持 Prisma 8**。`package.json` 里写死 `7.10.1`，不要用 `^` 或 `latest` |
| @prisma/adapter-pg | 7.10.1 | Prisma 7 起所有数据库都必须走 driver adapter |
| PostgreSQL | Neon | 运行时用 pooled 串，迁移用 direct 串 |
| Better Auth | 1.7.19 | `@better-auth/prisma-adapter` |
| Zod | 4.6.7 | 入参校验 |

### Prisma 7 的三个坑（实现时必须注意）

1. **客户端不再生成到 `node_modules`**。`generator client { provider = "prisma-client", output = "../src/generated/prisma" }`，业务代码从 `@/generated/prisma/client` 导入。
2. **`datasource` 块里不写 `url`**。连接串在根目录的 `prisma.config.ts` 里（Prisma 7.10.1 已实测该文件名可用；`prisma7.config.ts` 也是被识别的别名）：
   ```ts
   import "dotenv/config";
   import { defineConfig, env } from "prisma/config";

   export default defineConfig({
     schema: "prisma/schema.prisma",
     migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
     datasource: { url: env("DIRECT_URL") }, // 迁移走直连串
   });
   ```
3. **`prisma migrate dev` 不再自动跑 seed**，必须显式 `npx prisma db seed`。

### 运行时数据库客户端

```ts
// src/server/db.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL, // Neon pooled
  max: 5,
  connectionTimeoutMillis: 10_000, // pg 默认 0（无限等待），必须显式设置
});

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

> Better Auth 的 `prismaAdapter(prisma, { provider: "postgresql" })` 与 Prisma 7 的生成客户端在类型上可能有摩擦（adapter 的类型签名基于 `@prisma/client`）。运行时一致，类型层面必要时用一次 `as unknown as PrismaClient` 收敛，并在该行加注释说明原因。

---

## 2. 目录结构

```
giftdeal/
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  │  └─ 20260101000000_init/
│  │     └─ migration.sql          # 末尾追加 contact 部分唯一索引（见 01 文档 3.2）
│  └─ seed.ts
├─ prisma.config.ts
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx                # 最小占位，前端另接
│  │  ├─ page.tsx
│  │  └─ api/
│  │     ├─ auth/[...all]/route.ts # Better Auth 挂载：export const { GET, POST } = toNextJsHandler(auth)
│  │     └─ v1/
│  │        ├─ health/route.ts
│  │        ├─ me/route.ts
│  │        ├─ overview/route.ts
│  │        ├─ ledgers/route.ts
│  │        ├─ ledgers/[ledgerId]/route.ts
│  │        ├─ contacts/route.ts
│  │        ├─ contacts/[contactId]/route.ts
│  │        ├─ contacts/[contactId]/settlement/route.ts
│  │        ├─ records/route.ts
│  │        ├─ records/[recordId]/route.ts
│  │        ├─ records/[recordId]/settle/route.ts
│  │        ├─ records/[recordId]/unsettle/route.ts
│  │        ├─ pending-returns/route.ts
│  │        ├─ invites/route.ts
│  │        └─ invites/[token]/
│  │           ├─ route.ts         # GET 详情 / DELETE 撤销
│  │           └─ accept/route.ts
│  ├─ server/
│  │  ├─ auth.ts                   # betterAuth 配置（phoneNumber 插件 + 建号钩子）
│  │  ├─ db.ts                     # PrismaClient 单例 + adapter
│  │  ├─ bootstrap.ts              # 首次登录建默认账本
│  │  ├─ http/
│  │  │  ├─ envelope.ts            # ok() / fail()
│  │  │  ├─ errors.ts              # AppError + 错误码 → HTTP 状态映射
│  │  │  └─ route.ts               # withRoute()：统一 try/catch + 校验 + 日志
│  │  ├─ guards/
│  │  │  ├─ session.ts             # requireSession()
│  │  │  └─ ledger.ts              # requireLedgerContext() → { userId, ledgerId, role }
│  │  ├─ validators/
│  │  │  ├─ common.ts              # 分页、日期、金额、id
│  │  │  ├─ ledger.ts
│  │  │  ├─ contact.ts
│  │  │  ├─ record.ts
│  │  │  └─ invite.ts
│  │  ├─ services/
│  │  │  ├─ ledger.service.ts
│  │  │  ├─ contact.service.ts
│  │  │  ├─ record.service.ts
│  │  │  ├─ settlement.service.ts  # 结清 / 反结清 / 删除时的回退
│  │  │  ├─ stats.service.ts       # 净差额、汇总、待回礼聚合
│  │  │  └─ invite.service.ts
│  │  ├─ mappers/
│  │  │  ├─ contact.mapper.ts      # Prisma row → DTO
│  │  │  └─ record.mapper.ts
│  │  └─ otp/
│  │     ├─ index.ts               # OtpProvider 接口 + 工厂
│  │     └─ mock-provider.ts       # 打印到日志，固定验证码
│  └─ lib/
│     ├─ money.ts                  # centsToYuan / yuanToCents
│     ├─ date.ts                   # toDateOnly / parseDateOnly / daysBetween
│     └─ constants.ts              # 场景中文名映射、错误码常量
├─ scripts/
│  └─ smoke.mjs                    # 接口冒烟（Node 原生 fetch）：登录 → 账本 → 联系人 → 记录 → 结清 → 越权 → 邀请
├─ docs/                           # 设计文档
├─ .env.example
└─ package.json
```

### package.json（依赖部分）

```json
{
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "prisma generate && next build",
    "start": "next start",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy",
    "db:seed": "prisma db seed",
    "db:studio": "prisma studio"
  },
  "dependencies": {
    "next": "16.4.6",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@prisma/client": "7.10.1",
    "@prisma/adapter-pg": "7.10.1",
    "pg": "^8.16.0",
    "better-auth": "1.7.19",
    "@better-auth/prisma-adapter": "^1.7.19",
    "zod": "4.6.7"
  },
  "devDependencies": {
    "prisma": "7.10.1",
    "tsx": "^4.20.0",
    "typescript": "^5.9.0",
    "@types/node": "^22.0.0",
    "@types/pg": "^8.15.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0"
  }
}
```

> 构建脚本里带 `prisma generate`：Vercel 上 `src/generated/prisma` 不入库，必须在 build 阶段生成。

---

## 3. 分层与调用链

```
Route Handler  →  guard  →  validator(zod)  →  service  →  prisma  →  mapper  →  envelope
```

| 层 | 职责 | 禁止 |
|---|---|---|
| Route Handler | 解析请求、调 guard、调 service、包信封 | 不写业务逻辑、不直接调 prisma |
| guard | 会话校验 + 账本成员校验 | 不做业务判断 |
| validator | 入参形状与范围校验 | 不查库 |
| service | 业务规则、事务、聚合 | 不碰 `Request` / `Response` |
| mapper | Prisma row → DTO（金额、日期、枚举中文） | 不含业务判断 |

**service 签名统一为** `fn(ctx: LedgerContext, input: T)`，其中 `LedgerContext = { userId, ledgerId, role }` 由 guard 产出。service 内部**不允许**再从入参里读 `ledgerId` 或 `userId`。

---

## 4. 数据隔离：三道防线

这是本项目的硬性安全要求，实现时按下面三层同时落地，任何一层缺失都视为缺陷。

### 第一道：路由层 guard

```ts
export async function requireLedgerContext(req: Request): Promise<LedgerContext> {
  const session = await requireSession();                       // 401
  const ledgerId = req.headers.get("x-ledger-id")
    ?? new URL(req.url).searchParams.get("ledgerId");           // 400 LEDGER_REQUIRED
  if (!ledgerId) throw new AppError("LEDGER_REQUIRED");

  const membership = await prisma.membership.findUnique({
    where: { ledgerId_userId: { ledgerId, userId: session.user.id } },
  });
  if (!membership) {
    // 区分「账本不存在」与「无权限」，但都不泄露账本内容
    const exists = await prisma.ledger.count({ where: { id: ledgerId } });
    throw exists ? new AppError("LEDGER_FORBIDDEN") : new AppError("LEDGER_NOT_FOUND");
  }
  return { userId: session.user.id, ledgerId, role: membership.role };
}
```

### 第二道：查询层强制带 ledgerId

所有列表 / 聚合查询的 `where` 必须包含 `ledgerId: ctx.ledgerId`。

### 第三道：单资源操作禁止裸 findUnique

```ts
// 禁止
const record = await prisma.record.findUnique({ where: { id: recordId } });
// 必须
const record = await prisma.record.findFirst({
  where: { id: recordId, ledgerId: ctx.ledgerId, deletedAt: null },
});
if (!record) throw new AppError("NOT_FOUND");
```

`findFirst({ where: { id, ledgerId } })` 是唯一允许的单资源读取方式。**跨账本访问天然表现为 404，不泄露资源是否存在。**

> 代码评审 checklist 第一条：全文搜索 `findUnique({ where: { id:`，确认没有绕过账本过滤的写法（`ledgerId_userId` 复合唯一键除外）。

---

## 5. 认证流程

### 5.1 Better Auth 配置要点

```ts
// src/server/auth.ts
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { phoneNumber } from "better-auth/plugins";
import { prisma } from "./db";
import { otpProvider } from "./otp";
import { bootstrapUser } from "./bootstrap";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  plugins: [
    phoneNumber({
      otpLength: 6,
      expiresIn: 300,
      allowedAttempts: 3,
      sendOTP: ({ phoneNumber, code }) => { void otpProvider.send(phoneNumber, code); }, // 不 await
      signUpOnVerification: {
        getTempEmail: (p) => `${p.replace(/\D/g, "")}@phone.local`,
        getTempName: (p) => `用户${p.slice(-4)}`,
      },
      phoneNumberValidator: (p) => /^\+86\d{11}$/.test(p), // 只接受中国大陆号码
    }),
  ],
  databaseHooks: {
    user: { create: { after: async (user) => { await bootstrapUser(user.id); } } },
  },
  advanced: { database: { joins: true } },
});
```

- `sendOTP` **不 await**（官方明确建议），失败只记日志，避免时序攻击与响应变慢。
- `signUpOnVerification` 实现「验证即注册」，`getTempEmail` 产出占位邮箱（schema 中 `email` 非空唯一）。
- 首次建号后由 `databaseHooks.user.create.after` 建默认账本。

### 5.2 首次登录的引导（bootstrap）

```ts
// src/server/bootstrap.ts
export async function bootstrapUser(userId: string) {
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || user.defaultLedgerId) return;

    const ledger = await tx.ledger.create({ data: { name: "我的礼金账本" } });
    await tx.membership.create({ data: { ledgerId: ledger.id, userId, role: "OWNER" } });
    await tx.user.update({ where: { id: userId }, data: { defaultLedgerId: ledger.id } });
  });
}
```

`GET /api/v1/me` 里再调一次 `bootstrapUser`（幂等，`defaultLedgerId` 非空直接返回），兜住钩子失败或历史数据。

### 5.3 验证码 provider

| 环境 | 行为 |
|---|---|
| `SMS_PROVIDER=mock` + `OTP_ALLOW_FIXED_CODE=true`（本地/联调） | 验证码固定为 `OTP_MOCK_CODE`（默认 `123456`），同时 `console.log` 输出 `[OTP][mock] +8613800000001 -> 123456` |
| `SMS_PROVIDER=mock`，未开 `OTP_ALLOW_FIXED_CODE`（生产） | 走 Better Auth 真实随机码，只打印到日志；启动时打印一次告警 |
| 未来接入真实短信 | 实现 `OtpProvider` 接口即可，业务代码零改动 |

> 用显式开关而不是 `NODE_ENV` 判断：预览部署（Vercel Preview）也是 `NODE_ENV=production`，但仍需要固定验证码联调；生产环境不设该变量即自动关闭。

防爆破：Better Auth 的 `allowedAttempts: 3` 会在同一验证码连续试错 3 次后作废并返回 403。请求频率限制依赖 Better Auth 内置限流（生产环境生效）。

---

## 6. 错误处理

```ts
// src/server/http/errors.ts
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;
  readonly status: number;   // 由 ERROR_STATUS 映射表决定
}
```

`handle(req, fn)`（`src/server/http/route.ts`）统一捕获并按序处理：

| 异常 | 映射 |
|---|---|
| `AppError` | 用 `code` + 内置状态码表 |
| `ZodError` | `422 VALIDATION_ERROR`，`details.fieldErrors` |
| Prisma `P2002`（唯一约束） | 按上下文映射（联系人 → `CONTACT_NAME_DUPLICATE`，其余 → `CONFLICT`） |
| 其他 | `500 INTERNAL_ERROR`，`console.error` 打完整堆栈 + 请求 id，响应体不含内部细节 |

响应体里**永不出现**堆栈、SQL、Prisma 错误原文。

---

## 7. seed 脚本设计

### 7.1 目标

- 生成 **2 个账本、2 个用户、12 位联系人、24 条记录**（含已结清 / 未结清 / 手动结清 / 关联结清四种状态）
- **固定 ID**，前端可直接硬编码调试
- **幂等**：可重复执行，不产生重复数据

### 7.2 固定 ID 约定

| 类型 | 规则 | 示例 |
|---|---|---|
| 用户 | `usr_demo_{a,b}` | `usr_demo_a` |
| 账本 | `led_{zhang,li}` | `led_zhang` |
| 联系人 | `con_{a,b}_{001..}` | `con_a_001` |
| 记录 | `rec_{a,b}_{001..}` | `rec_a_013` |

### 7.3 数据清单

**用户与账本**

| 用户 | 手机号 | 姓名 | 默认账本 |
|---|---|---|---|
| `usr_demo_a` | `+8613800000001` | 张伟 | `led_zhang` |
| `usr_demo_b` | `+8613800000002` | 李娜 | `led_li` |

| 账本 | 名称 | OWNER | MEMBER |
|---|---|---|---|
| `led_zhang` | 张家礼金账 | `usr_demo_a` | `usr_demo_b` |
| `led_li` | 李家礼金账 | `usr_demo_b` | `usr_demo_a` |

> 两个用户互为对方账本的成员，用于验证「多账本切换」与「共享账本」两条路径。

**联系人**

| ID | 姓名 | 关系 | 所属账本 |
|---|---|---|---|
| `con_a_001` | 王建国 | 亲戚 | led_zhang |
| `con_a_002` | 刘芳 | 亲戚 | led_zhang |
| `con_a_003` | 陈晓明 | 同事 | led_zhang |
| `con_a_004` | 赵磊 | 同学 | led_zhang |
| `con_a_005` | 孙阿姨 | 邻居 | led_zhang |
| `con_a_006` | 周敏 | 朋友 | led_zhang |
| `con_a_007` | 吴强 | 同事 | led_zhang（**无记录**，用于测试空状态与删除） |
| `con_b_001` | 李国强 | 亲戚 | led_li |
| `con_b_002` | 郑爽 | 朋友 | led_li |
| `con_b_003` | 马超 | 同事 | led_li |
| `con_b_004` | 何静 | 同学 | led_li |
| `con_b_005` | 高远 | 其他 | led_li |

**账本 A（张家）14 条记录** —— 送出 4300 元 / 收到 4100 元 / 净差额 **-200 元** / 待回礼 **5 条 3000 元**

| ID | 联系人 | 方向 | 金额(分) | 场景 | 日期 | 结清状态 |
|---|---|---|---|---|---|---|
| rec_a_001 | 王建国 | RECEIVED | 80000 | WEDDING | 2025-10-01 | 已结清（被 rec_a_013 关联） |
| rec_a_002 | 王建国 | RECEIVED | 50000 | BABY_FULL_MONTH | 2026-03-08 | 未结清 |
| rec_a_003 | 刘芳 | RECEIVED | 100000 | WEDDING | 2025-05-20 | 未结清 |
| rec_a_004 | 刘芳 | GIVEN | 60000 | FUNERAL | 2025-12-11 | — |
| rec_a_005 | 陈晓明 | GIVEN | 50000 | WEDDING | 2026-02-14 | — |
| rec_a_006 | 陈晓明 | RECEIVED | 30000 | BABY_FULL_MONTH | 2026-06-18 | 已结清（手动，2026-06-20） |
| rec_a_007 | 赵磊 | GIVEN | 120000 | WEDDING | 2025-09-09 | — |
| rec_a_008 | 赵磊 | RECEIVED | 80000 | BABY_HUNDRED_DAYS | 2026-04-02 | 未结清 |
| rec_a_009 | 孙阿姨 | RECEIVED | 20000 | FUNERAL | 2025-08-08 | 未结清 |
| rec_a_010 | 孙阿姨 | GIVEN | 20000 | BABY_FULL_MONTH | 2026-01-20 | — |
| rec_a_011 | 周敏 | GIVEN | 60000 | WEDDING | 2026-05-01 | — |
| rec_a_012 | 周敏 | RECEIVED | 50000 | OTHER | 2026-07-07 | 未结清 |
| rec_a_013 | 王建国 | GIVEN | 80000 | WEDDING | 2026-01-15 | 结清 rec_a_001 |
| rec_a_014 | 刘芳 | GIVEN | 40000 | BABY_FULL_MONTH | 2026-08-16 | — |

**账本 B（李家）10 条记录** —— 送出 3400 元 / 收到 4400 元 / 净差额 **+1000 元** / 待回礼 **3 条 3500 元**

| ID | 联系人 | 方向 | 金额(分) | 场景 | 日期 | 结清状态 |
|---|---|---|---|---|---|---|
| rec_b_001 | 李国强 | RECEIVED | 200000 | WEDDING | 2025-06-06 | 未结清 |
| rec_b_002 | 李国强 | GIVEN | 120000 | BABY_FULL_MONTH | 2026-02-02 | — |
| rec_b_003 | 郑爽 | GIVEN | 80000 | WEDDING | 2025-11-11 | — |
| rec_b_004 | 郑爽 | RECEIVED | 60000 | BABY_FULL_MONTH | 2026-03-03 | 已结清（被 rec_b_005 关联） |
| rec_b_005 | 郑爽 | GIVEN | 60000 | WEDDING | 2026-09-09 | 结清 rec_b_004 |
| rec_b_006 | 马超 | GIVEN | 50000 | FUNERAL | 2025-07-07 | — |
| rec_b_007 | 马超 | RECEIVED | 50000 | WEDDING | 2026-06-06 | 未结清 |
| rec_b_008 | 何静 | RECEIVED | 100000 | BABY_HUNDRED_DAYS | 2025-12-12 | 未结清 |
| rec_b_009 | 高远 | GIVEN | 30000 | OTHER | 2026-04-04 | — |
| rec_b_010 | 高远 | RECEIVED | 30000 | WEDDING | 2026-05-05 | 已结清（手动，2026-05-06） |

**邀请（2 条，用于前端联调邀请落地页）**

| token | 账本 | 状态 |
|---|---|---|
| `invite_demo_pending_0000000000000001` | led_zhang | PENDING，7 天后过期 |
| `invite_demo_expired_0000000000000002` | led_li | 已过期（昨天） |

### 7.4 实现方式

```ts
// prisma/seed.ts 结构
const USERS = [...];      // 常量表
const LEDGERS = [...];
const CONTACTS = [...];
const RECORDS = [...];
const INVITES = [...];

async function main() {
  // 1. upsert users（含 phoneNumber / phoneNumberVerified: true / defaultLedgerId）
  // 2. upsert ledgers
  // 3. upsert memberships
  // 4. upsert contacts
  // 5. upsert records：先写普通记录，再写「结清方」记录并回填被结清记录的
  //    settledAt / settledByRecordId（两步，避免外键指向尚未创建的行）
  // 6. upsert invites
  // 7. 打印汇总表（各账本 record 数、待回礼数、净差额），便于人工核对
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
```

- 全部使用 `upsert`（`where: { id }`），**幂等**
- 支持 `--reset`：先按固定 ID 前缀删除 `record` / `contact` / `invite` / `membership` / `ledger` / `user`（顺序遵守外键），再重新写入
- seed 里的 `createdAt` / `updatedAt` 用固定值，避免每次跑完 diff 变化

### 7.5 使用方式

```bash
cp .env.example .env              # 填 DATABASE_URL / DIRECT_URL
npx prisma migrate deploy         # 初始迁移已随仓库提交
npx prisma db seed                # 幂等；要重置演示数据加 -- --reset
npm run dev
# 登录：+8613800000001 / 验证码 123456（需 OTP_ALLOW_FIXED_CODE=true）
```

---

## 8. 环境变量

```ini
# .env.example
# Neon pooled 连接串（运行时用，host 含 -pooler）
DATABASE_URL="postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/giftdeal?sslmode=require"
# Neon 直连串（迁移用）
DIRECT_URL="postgresql://user:pass@ep-xxx.region.aws.neon.tech/giftdeal?sslmode=require"

BETTER_AUTH_SECRET="openssl rand -base64 32 生成"
BETTER_AUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"   # 邀请链接域名

SMS_PROVIDER="mock"        # mock | (future) aliyun / tencent
OTP_MOCK_CODE="123456"
OTP_ALLOW_FIXED_CODE="true"  # 仅开发/联调；生产环境不要设置
```

> Prisma 7 起 `.env` 不再自动加载，`prisma.config.ts` 顶部需 `import "dotenv/config"`；Next.js 自身仍会加载 `.env`。

---

## 9. 部署（Vercel + Neon）

1. Neon 项目建库，取 **pooled** 串填 `DATABASE_URL`，**direct** 串填 `DIRECT_URL`。
2. Vercel 环境变量同上；`BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` 填生产域名。
3. Build Command 用 `npm run build`（内含 `prisma generate`）。
4. 迁移**不要**放在 build 里（并发构建会重复执行）：本地或 CI 里跑 `npx prisma migrate deploy`。
5. `@prisma/adapter-pg` 的 `max` 设 5 以内：Neon pooled 已经做了连接复用，serverless 实例数一多容易打满。

---

## 10. 实施结果

### 10.1 已完成

| # | 内容 | 状态 |
|---|---|---|
| 1 | Next 16 + Prisma 7.10.1 + Better Auth 1.7.19 工程初始化 | ✅ |
| 2 | 初始迁移（含 contact 部分唯一索引） | ✅ |
| 3 | `db` / `errors` / `envelope` / `handle` 基础设施 | ✅ |
| 4 | Better Auth 接入 + 首次登录建默认账本 + mock OTP | ✅ |
| 5 | 三层数据隔离 guard | ✅ |
| 6 | 用户 / 账本 / 汇总接口 | ✅ |
| 7 | 联系人 CRUD + 模糊搜索 + 软删除 | ✅ |
| 8 | 记录 CRUD + 关联结清 / 手动结清 / 反结清 / 删除回退 | ✅ |
| 9 | 按人对账 + 待回礼 + overview 聚合 | ✅ |
| 10 | 邀请（生成 / 详情 / 接受 / 撤销） | ✅ |
| 11 | seed 脚本（幂等 + `--reset`） | ✅ |
| 12 | `scripts/smoke.mjs` 冒烟测试 | ✅ 44/44 |

### 10.2 实测结论

`npx prisma validate` / `prisma migrate deploy` / `prisma db seed` / `tsc --noEmit` / `next build` 全部通过；
`scripts/smoke.mjs` 对真实运行的 `next start` 实例跑通 **44 项断言，0 失败**，覆盖：

- 手机号验证码登录、会话 Cookie、`/me` 默认账本
- 双账本列表、汇总数字与 seed 完全一致（A：送出 4300 / 收到 4100 / 净 -200 / 待回礼 5 笔）
- 联系人模糊搜索、新建、重名 409
- 按人对账净差额与流水条数
- 新建送出记录并关联结清 → 待回礼减 1；删除该记录 → 结清回退、待回礼恢复
- 手动结清、重复结清 409、对送出记录结清 409、反结清
- 缺 `X-Ledger-Id` 400、不存在的账本 404、跨账本读记录 404、未登录 401
- 邀请：邀请人视角 `alreadyMember=true`、新用户接受后成为 MEMBER、重复接受 410 `INVITE_USED`

### 10.3 尚未验证 / 待接入

- **Neon 真实连接**：本地验证用的是 Postgres 兼容引擎，Neon 的 pooled 串与 SSL 需在部署时确认（`sslmode=require` 已写进连接串）。
- **真实短信通道**：目前 mock，验证码打到日志。
- **Vercel 部署**：未实际部署。

---

## 11. 前端实现

### 11.1 设计来源

原型文件未纳入仓库。落地时完整沿用其设计系统：

- **配色**：宣纸底 `#faf8f5`、朱柿赤 `#c84630`（收礼 / 主操作）、青黛墨蓝 `#2d5a7b`（送礼）、松烟香木 `#8c7a6b`（中性）、白事用青灰 `#4a5560`
- **语义**：净差额不用红绿涨跌，改用「承蒙厚爱 / 厚谊在彼 / 往还平衡」三种礼俗化表述
- **字体**：正文 Plus Jakarta Sans + 中文回退 PingFang/微软雅黑；金额一律等宽数字（`font-variant-numeric: tabular-nums`）
- **形状**：卡片 16px 圆角、发丝描边 `#eae5de`、极浅投影，不用重阴影

没有引入 Tailwind 或组件库：设计系统高度定制，直接写 CSS 变量 + 语义类更可控，也少一层构建依赖。

### 11.2 路由与页面

| 路由 | 页面 | 对应原型 |
|---|---|---|
| `/login` | 手机验证码登录（左品牌 + 右表单） | `_9` |
| `/` | 首页看板：待回礼横幅、三张统计卡、亲友往来册、场景分布 | `_1` / `_3` |
| `/contacts` | 人情对账：左侧名录 + 右侧占位 | `_2` |
| `/contacts/[id]` | 单人双向对账：净差额、收发合计、时间线 | `_2` / `_4` |
| `/pending` | 待回礼清单：账龄、逐笔标记已还、去记一笔 | `_10` / `_5` |
| `/ledger` | 家庭共享：账本信息、成员、邀请、账本切换 | `_8` / `_6` |
| `/invite/[token]` | 邀请落地页：接受邀请 / 已加入 / 失效提示 | — |

### 11.3 目录

```
src/
  app/
    (app)/                 登录后的应用外壳（侧栏 + 底部导航）
      layout.tsx           鉴权守卫 + RecordDialogProvider
      page.tsx             看板
      contacts/            名录与对账
      pending/             待回礼
      plans/               人情预备（新增 / 改 / 删 / 完成）
      ledger/              账本与成员
    login/page.tsx         登录
    invite/[token]/page.tsx 邀请落地
    globals.css            设计令牌 + 组件样式 + 响应式
  components/
    providers.tsx          Auth / Ledger / Toast 三个上下文
    app-shell.tsx          侧栏、账本切换器、移动端底部导航
    record-dialog.tsx      记一笔弹层（全局，任何页面可唤起）
    plan-dialog.tsx        人情预备弹层（新增 / 修改 / 完成三种模式）
    contact-filters.tsx    人群 / 礼金 / 方向三维筛选
    contact-list.tsx       名录（看板与对账页复用）
    contact-detail.tsx     对账详情
    ui.tsx                 Avatar / Modal / Empty / Donut / Loading
    icons.tsx              内联 SVG 图标集
  lib/
    api.ts                 信封解包 + X-Ledger-Id + 401 广播
    auth-client.ts         better-auth 客户端（phoneNumber 插件）
    format.ts              金额 / 日期 / 场景色 / 净差额措辞
    types.ts               与 DTO 一一对应的类型
```

### 11.4 状态管理

不引入数据请求库，三个 Context 足够：

- `AuthProvider`：会话、登录态、登出；监听 401 事件自动清空用户
- `LedgerProvider`：`/me` → 账本列表、当前账本（localStorage 记忆）、`/overview` 汇总；提供 `refresh()`，记账 / 结清后统一刷新
- `ToastProvider`：轻提示

页面级列表各自 `useEffect` 拉取，依赖 `ledgerId` 与 `overview.recordCount` —— 后者变化即意味着数据被改过，自动重取，不需要事件总线。

### 11.5 响应式

| 断点 | 布局 |
|---|---|
| ≥1180px | 260px 侧栏 + 多栏内容（看板右侧 322px 副栏） |
| 860–1179px | 侧栏收成 76px 图标轨，副栏并到主栏下方 |
| <860px | 侧栏隐藏，顶部吸顶栏 + 底部五格导航（中间悬浮「记一笔」），弹层改为底部抽屉 |

### 11.6 与后端的对接约定

- 所有业务请求经 `api()`，自动带 `X-Ledger-Id`；401 广播事件让外壳跳登录
- 金额只传分：输入框收「元」，提交前 `Math.round(yuan * 100)`
- 日期只传 `YYYY-MM-DD`，展示统一 `2026.03.08`
- 错误按 `error.code` 分支：重名 → 提示换名，已结清 → 提示刷新，其余直接展示 `message`

---


## 12. 人情预备实现要点

> 需求：未来必然发生的事（同学结婚、亲戚满月），提前把礼金备出来。

**模型**：新增 `GiftPlan` 表 + `PlanStatus` 枚举，增量迁移 `20261110160000_add_gift_plan`。挂在 `Contact` 下，`recordId` 唯一，完成后指向生成的真实 `Record`。

**为什么金额不落进收支**：预备是「计划」，不是已发生的账。若计入 `givenTotalCents`，净差额会在事情还没办时就变了，对账口径会失真。`overview` 单列 `planCount` / `planCents` / `nextPlan`，前端首页单独一块展示。

**完成走单事务**：`prisma.$transaction` 内先建 `Record` 再更新 `GiftPlan`，避免「记录有了但预备还挂着」。`createRecord=false` 时只改状态，用于礼金早已单独记过的情况。

**软删除且不级联**：删预备不影响已生成的 `Record`（那已是真实账目）。已完成的预备禁止再改、禁止重复完成，都返回 409。

**数据隔离复用既有三道防线**：所有 `findFirst` 都带 `ledgerId`；跨账本读预备返回 404 而非 403，不泄露资源存在性。冒烟脚本已覆盖。

**前端入口**：侧栏与移动端底部导航各一项（带预备中笔数角标），首页「人情预备」横条展示最近 3 笔并提供「查看全部」，移动端底栏把「共享」让位给「预备」、顶栏补回共享图标。

**统计卡不随页签清零**：页头的三张统计卡读 `overview` 汇总，而不是当前页签的列表；否则切到「已完成」会全部显示 0。


## 13. 隐私模式与日期分流实现要点

### 13.1 遮罩放在展示层，解锁状态放在服务端

- 遮罩规则是纯函数（`src/lib/mask.ts`）：`maskMoney` 逐字符替换数字、`maskPerson` 取姓氏（含复姓表）、`maskFreeText` 遮备注数字、`maskPhone` 遮手机号。
- 所有页面通过 `usePrivacy()` 拿到 `money / person / note / phone` 四个展示函数；组件不直接调 `formatAmount`，避免漏点。
- 解锁状态**不由前端保存**：服务端校验 `gd_privacy` Cookie（HMAC 签名 + userId 绑定 + 8 小时过期），前端只读 `/api/v1/privacy/status`。改 localStorage / 改 JS 都无法伪造解锁。
- 锁定态下「编辑亲友档案」「修改预备」「完成预备」会先弹密码框——这些弹窗会预填真实姓名与金额，直接打开等于绕过遮罩。

### 13.2 二次验证用固定隐私密码

- 密码由服务端环境变量 `PRIVACY_PASSWORD` 提供（默认 `331633`），**只参与服务端校验**，不会出现在任何前端 bundle 里。
- 比对前先做 SHA-256 摘要，再用 `timingSafeEqual` 比较，避免明文比较与时序攻击。
- 连续输错 5 次锁定 1 分钟（进程内 Map，与现有 OTP 节流同样的多实例局限）；成功一次即清零。
- 不再发短信、不落库验证码，`privacy/send-code` 接口已移除；登录验证码通道完全不受影响。

### 13.3 「记一笔」按日期分流

- 判定用本地日期字符串比较（`occurredAt > today`），避免时区把「今天」算成「明天」。
- 未来日期默认 `POST /api/v1/plans`，标题/按钮/提示同步切换；用户可手动改回「记入账簿」。
- 有「关联待回礼」时强制走记录接口——预备不能结清。
- 提交成功后统一 `refresh()`，首页的 `planCount` 与预备横条自动更新。

### 13.4 亲友往来册的「时序」分类

- 联系人统计新增 `planCount`（该亲友 PLANNED 状态的预备笔数），由 `stats.service` 一次 `groupBy` 聚合。
- 筛选维度新增第四行「时序」：全部 / 已发生 / 有预备 / 仅预备，与「记一笔」的分流规则一一对应。
- 联系人行显示「预备 N 笔」标签，和「待回礼」并列。

## 14. 明确不做

| 不做 | 原因 |
|---|---|
| 微信登录 | `wxOpenId` 只留字段，无任何逻辑 |
| 复杂 RBAC | 仅 `OWNER` / `MEMBER`，只用于改账本名 |
| 审计日志 | 只有 `createdById` / 时间戳 |
| 数据导出 | 无接口、无依赖 |
| 礼俗知识库 | `scene` 仅枚举 |
| 预备到期自动提醒 / 自动记账 | 事情可能延期，由用户决定完成、改期或删除 |
| 退出账本 / 转让 OWNER | 超出 MVP；需要时再加接口 |
| 记录附件（请柬照片） | 超出 MVP，需对象存储 |
