# 01 · 数据模型设计

> 对应文件：`prisma/schema.prisma`
> 目标读者：后端实现者、前端对接者

---

## 1. 关系总览

```
User ──< Membership >── Ledger ──< Contact ──< Record
 │                        │            │            │
 │                        │            └──< GiftPlan ──(完成后可选生成)─> Record
 │                        └──< Invite            └── self-relation: 送出记录 → 收到记录（结清）
 └── defaultLedgerId ──> Ledger
```

- 一个用户可加入多个账本（`Membership` 多对多）。
- 一个账本内有多位联系人（`Contact`），每位联系人有若干礼金记录（`Record`）。
- 一条「送出」记录可以选择性地结清一条「收到」记录（自关联，一对一）。
- `GiftPlan`（人情预备）挂在联系人下，是**尚未发生的计划**；完成时可生成一条 `Record`。

---

## 2. 表与字段

### 2.1 User（用户）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | String (PK) | Better Auth 生成 |
| name | String | 显示名，注册时默认「用户 + 手机号后四位」 |
| email | String UNIQUE | **占位邮箱** `{phone}@phone.local`，仅满足 Better Auth 默认模型约束，不对外暴露、不用于登录 |
| emailVerified | Boolean | 恒为 false（MVP 无邮箱流程） |
| phoneNumber | String UNIQUE | **E.164 格式**，如 `+8613800000001`。登录唯一凭据 |
| phoneNumberVerified | Boolean | 验证码验证通过后为 true |
| wxOpenId | String? UNIQUE | 预留字段，MVP 恒为 null，不参与任何逻辑 |
| defaultLedgerId | String? FK → Ledger | 登录后默认进入的账本 |
| createdAt / updatedAt | DateTime | — |

> **手机号格式是硬约束**：Better Auth 默认校验 `^\+[1-9]\d{1,14}$`。前端在调用发送验证码前必须把用户输入的 11 位号码规范化为 `+86` 前缀格式，否则会得到 400。后端配置 `phoneNumberValidator` 做二次兜底（仅接受 `+86` 开头的中国大陆号码）。

### 2.2 Ledger（账本）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | String (PK) | cuid |
| name | VarChar(50) | 账本名，如「张家礼金账」 |
| createdAt / updatedAt | DateTime | — |

账本不设 `ownerId` 字段：**「谁是创建者」由 `Membership.role = OWNER` 表达**，避免两处真相。每个账本在创建时必定同时写入一条 OWNER membership。

### 2.3 Membership（账本成员）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | String (PK) | — |
| ledgerId | FK → Ledger | 级联删除 |
| userId | FK → User | 级联删除 |
| role | enum `OWNER` / `MEMBER` | 仅用于「改账本名」这类轻量权限判断，不做复杂 RBAC |
| joinedAt | DateTime | — |

- `@@unique([ledgerId, userId])` —— **防重复加入的第一道防线**（数据库级）。
- 所有业务接口的鉴权入口都是这张表：`WHERE ledgerId = ? AND userId = ?`，查不到即 403。

### 2.4 Contact（联系人）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | String (PK) | — |
| ledgerId | FK → Ledger | 级联删除 |
| name | VarChar(30) | 姓名，账本内唯一（仅对未删除的记录生效） |
| relationTag | VarChar(20)? | 亲友分组，受控枚举：`FATHER_SIDE` / `MOTHER_SIDE` / `PRIMARY_SCHOOL` / `JUNIOR_SCHOOL` / `HIGH_SCHOOL` / `COLLEGE` / `COLLEAGUE` / `FRIEND` / `OTHER` |
| phone | VarChar(20)? | 可选，便于联系 |
| note | VarChar(200)? | 备注 |
| deletedAt | DateTime? | **软删除标记** |

### 2.5 Record（礼金记录）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | String (PK) | — |
| ledgerId | FK → Ledger | 冗余字段，用于所有查询直接按账本过滤，避免 join |
| contactId | FK → Contact | 所属联系人 |
| direction | enum `GIVEN` / `RECEIVED` | 送出 / 收到 |
| amountCents | Int | **金额（分）**，整数。单笔校验上限 10,000,000 分（10 万元） |
| scene | enum `GiftScene` | 婚礼 / 满月 / 百岁 / 白事 / 其他 |
| occurredAt | Date | 礼金发生的自然日 |
| note | VarChar(200)? | 备注 |
| settledAt | DateTime? | 结清时间。**`isSettled` 由它派生，不单独存布尔** |
| settledByRecordId | String? UNIQUE | 收到记录被哪条送出记录结清；手动结清时为 null |
| createdById | FK → User? | 谁记的账（共享账本里有用），用户注销时置 null |
| deletedAt | DateTime? | 软删除标记 |

**为什么 `isSettled` 不落库**：布尔 + 时间戳双写必然出现「已结清但没有结清时间」的脏数据。只保留 `settledAt`，DTO 里派生 `isSettled`。

**为什么 `amountCents` 用 Int 而不是 Decimal**：礼金永远是整数元，以分为单位存整数可以彻底避免浮点误差。Int 上限约 21.4 亿分（2147 万元），单笔记录远远够用；聚合时 Prisma `aggregate` 返回 number，在 MVP 数据规模下不会溢出。

### 2.6 Invite（邀请）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | String (PK) | — |
| ledgerId | FK → Ledger | 级联删除 |
| token | VarChar(64) UNIQUE | 32 字节随机 hex，不可猜测 |
| createdById | FK → User | 邀请人 |
| expiresAt | DateTime | 默认 7 天后过期 |
| usedAt | DateTime? | 被接受的时间 |
| usedByUserId | FK → User? | 被谁接受 |
| revokedAt | DateTime? | 主动撤销时间 |

**状态不落库，由字段派生**（优先级从上到下）：

| 状态 | 判定 |
|---|---|
| `REVOKED` | `revokedAt != null` |
| `USED` | `usedAt != null` |
| `EXPIRED` | `expiresAt < now()` |
| `PENDING` | 其余 |

**单次使用**：一个邀请只能被接受一次。多人邀请就生成多个邀请——比 `maxUses` 计数器简单且无并发问题。


### 2.7 GiftPlan（人情预备）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | String (PK) | — |
| ledgerId | FK → Ledger | 级联删除；所有查询强制带此字段 |
| contactId | FK → Contact | 级联删除；创建后不可改 |
| direction | RecordDirection | 默认 `GIVEN`，也支持预计收到 `RECEIVED` |
| scene | GiftScene | 五类受控枚举 |
| plannedCents | Int | 预计金额（分）；**只是计划，不进任何收支统计** |
| expectedAt | Date | 预计发生日；范围 1950-01-01 ～ 5 年内 |
| status | PlanStatus | `PLANNED` / `DONE`，默认 `PLANNED` |
| note | VarChar(200)? | 事由 |
| recordId | FK → Record? UNIQUE | 完成时生成的真实记录；`onDelete: SetNull` |
| completedAt | DateTime? | 完成时间；`DONE` 时非空 |
| createdById | FK → User? | 创建人 |
| deletedAt | DateTime? | 软删除 |
| createdAt / updatedAt | DateTime | — |

**关键约束与口径**：

- `recordId UNIQUE` 保证一条真实记录最多对应一笔预备，不会重复完成出两份账。
- **预备金额不计入** `givenTotalCents` / `receivedTotalCents` / `netCents` / `pendingReturn*`。`overview` 单列 `planCount` / `planCents` / `nextPlan`。
- `expectedAt` 过期**不自动改状态**——事情可能延期，由用户决定完成、改期或删除。前端用 `daysUntil` 显示「还有 N 天 / 已过 N 天」。
- 完成走**单事务**：生成 `Record` + 更新 `status` / `completedAt` / `recordId`，不会出现半成品。
- 删除预备是软删除，**不级联删除已生成的 `Record`**（那已经是真实账目）。
- 已完成的预备不允许再 `PATCH`（`409`），也不允许重复完成（`409`）。

索引：`(ledgerId, status, expectedAt)` 支撑「最近要办的事」；`(ledgerId, contactId)` 支撑按人筛选；`(ledgerId, deletedAt)` 支撑软删过滤。

---

## 3. 删除策略（已定：全部软删除）

> 二选一里选了软删除。理由：礼金是「钱的历史」，删掉联系人或记错一条记录就永久丢失对账依据，风险不可接受。

### 3.1 行为矩阵

| 操作 | 数据库行为 | 对查询的影响 | 对统计的影响 |
|---|---|---|---|
| 删除 Contact | `deletedAt = now()` | 联系人列表 / 搜索 / 详情默认不可见 | **其历史记录仍然保留并计入账本统计与按人对账**（按 id 仍可查到该联系人的流水） |
| 删除 Record | `deletedAt = now()` | 记录列表 / 待回礼 / 按人对账全部排除 | 不计入任何汇总 |
| 删除 GIVEN 记录（它结清过某条 RECEIVED） | 软删该记录 + **同事务把目标 RECEIVED 回退为未结清**（`settledAt = null, settledByRecordId = null`） | 目标记录重新出现在「待回礼」 | 两条记录都不再计入 |
| 删除 RECEIVED 记录（被某条 GIVEN 结清过） | 软删该记录 + 同事务把那条 GIVEN 的 `settledByRecordId` 置 null | — | 该 GIVEN 记录保留，只是不再标记「用于结清」 |
| 删除 GiftPlan | `deletedAt = now()` | 预备清单不再显示 | 原本就不计入统计；**已生成的 Record 保留** |

### 3.2 唯一约束与软删除的冲突

`Contact` 需要「同一账本内姓名唯一」，但软删除后同名联系人应该可以重新创建。Prisma 的 `@@unique` 不支持部分索引，因此在初始迁移里手写 SQL：

```sql
-- prisma/migrations/<timestamp>_init/migration.sql 追加
CREATE UNIQUE INDEX "contact_ledger_name_active_key"
  ON "contact" ("ledger_id", "name")
  WHERE "deleted_at" IS NULL;
```

创建 / 重命名联系人时，捕获 Prisma `P2002` 并映射为 `CONTACT_NAME_DUPLICATE`（409）。

### 3.3 为什么不物理删除

- 物理删除会让「已结清」的自关联断链，历史对账结果会随时间漂移。
- 软删除让「误删恢复」在未来变成一次 `UPDATE`，不需要数据恢复流程。
- MVP 数据量小，`deletedAt IS NULL` 的过滤成本可忽略。

---

## 4. 净差额口径（唯一权威定义）

```
givenTotalCents    = Σ amountCents where direction = GIVEN    and deletedAt is null
receivedTotalCents = Σ amountCents where direction = RECEIVED and deletedAt is null

netCents = receivedTotalCents - givenTotalCents
```

- `netCents > 0`：**收多于送**，我方欠对方人情 → 是待回礼的重点对象。
- `netCents < 0`：送多于收，对方欠我方。
- `netCents = 0`：两清。

**永不落库**，每次查询实时聚合（`groupBy` / `aggregate`）。前端不要缓存这个值做写操作依据。

「待回礼」的判定与 `netCents` 无关，只看记录本身：`direction = RECEIVED AND settledAt IS NULL AND deletedAt IS NULL`。

---

## 5. 索引与查询路径

| 查询 | 命中索引 |
|---|---|
| 校验成员身份 | `membership(ledger_id, user_id)` UNIQUE |
| 联系人列表 / 模糊搜索 | `contact(ledger_id, deleted_at)` + `contact(ledger_id, name)` |
| 某联系人的全部流水 | `record(ledger_id, contact_id, occurred_at)` |
| 待回礼 | `record(ledger_id, direction, settled_at)` |
| 账本流水（按时间倒序分页） | `record(ledger_id, occurred_at)` |
| 我的账本列表 | `membership(user_id)` |

`name ILIKE '%关键词%'` 在 MVP 数据规模（单账本联系人 < 200）下走顺序扫描完全可接受；若未来需要，再加 `pg_trgm` GIN 索引，不改接口。

---

## 6. 与「不做」清单的对应

| 明确不做 | 本设计的处理 |
|---|---|
| 复杂 RBAC | 只有 `OWNER` / `MEMBER` 两级，仅用于改账本名 |
| 审计日志 | 只保留 `createdById` / `createdAt` / `updatedAt` |
| 数据导出 | 无相关表 |
| 礼俗知识库 | `scene` 只是枚举，无扩展表 |
| 微信登录 | `wxOpenId` 字段预留，不写任何逻辑 |
