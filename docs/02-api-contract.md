# 02 · 接口契约

> Base URL：`/api/v1`（认证接口由 Better Auth 挂在 `/api/auth`）
> 版本：v1（MVP）
> 所有请求 / 响应均为 `application/json; charset=utf-8`

---

## 1. 通用约定

### 1.1 认证

- 会话基于 **httpOnly Cookie**，由 Better Auth 在 `/api/auth/*` 下发与维护。
- 前端与后端**必须同源**（同一个 Next 应用，或同一主域）。跨域会导致 Cookie 无法携带。
- 除 `GET /api/v1/health` 外，所有 `/v1` 接口都要求有效会话，否则返回 `401 UNAUTHENTICATED`。

### 1.2 账本上下文（硬性要求）

所有「账本内资源」的接口都必须携带 `ledgerId`，按以下优先级解析：

1. 请求头 `X-Ledger-Id`
2. 查询参数 `?ledgerId=`

两者都没有 → `400 LEDGER_REQUIRED`。
该用户不在该账本 → `403 LEDGER_FORBIDDEN`（**不允许用 404 掩盖，便于前端提示「无权限」**）。
账本不存在 → `404 LEDGER_NOT_FOUND`。

> 例外：`GET /api/v1/ledgers`、`POST /api/v1/ledgers`、`GET /api/v1/me`、`PATCH /api/v1/me`、邀请相关接口（token 自带账本上下文）。

### 1.3 响应信封

成功：

```json
{ "ok": true, "data": { } }
```

失败：

```json
{
  "ok": false,
  "error": {
    "code": "LEDGER_FORBIDDEN",
    "message": "你不是该账本成员",
    "details": null
  }
}
```

`details` 仅在 `VALIDATION_ERROR` 等场景有值，结构见各接口。

### 1.4 分页

请求：`?page=1&pageSize=20`（`page` 从 1 开始，`pageSize` 默认 20，最大 100）

响应：

```json
{ "ok": true, "data": { "items": [], "page": 1, "pageSize": 20, "total": 0 } }
```

### 1.5 数据格式

| 类型 | 格式 | 示例 |
|---|---|---|
| 金额 | `amountCents` 整数（分）+ `amountYuan` 字符串（两位小数，仅供展示） | `80000` / `"800.00"` |
| 日期（自然日） | `YYYY-MM-DD` | `"2026-05-01"` |
| 时间戳 | ISO 8601 UTC | `"2026-05-01T03:12:00.000Z"` |
| ID | cuid 字符串 | `"clx9k2..."` |

**金额只允许传 `amountCents`，绝不接受小数元。** 前端负责「元 → 分」换算（`Math.round(yuan * 100)`），并在提交前做整数校验。

### 1.6 错误码总表

| code | HTTP | 触发场景 |
|---|---|---|
| `UNAUTHENTICATED` | 401 | 无会话 / 会话过期 |
| `LEDGER_REQUIRED` | 400 | 缺少 `X-Ledger-Id` |
| `LEDGER_FORBIDDEN` | 403 | 用户不属于该账本 |
| `LEDGER_NOT_FOUND` | 404 | ledgerId 不存在 |
| `NOT_FOUND` | 404 | 资源不存在或不属于当前账本 |
| `VALIDATION_ERROR` | 422 | 入参校验失败，`details.fieldErrors` 给出字段级原因 |
| `CONTACT_NAME_DUPLICATE` | 409 | 同账本内已存在同名（未删除）联系人 |
| `RECORD_NOT_SETTLEABLE` | 409 | 对「送出」记录调用结清 |
| `RECORD_ALREADY_SETTLED` | 409 | 重复结清 |
| `RECORD_NOT_SETTLED` | 409 | 对未结清记录调用反结清 |
| `SETTLE_TARGET_INVALID` | 422 | `settlesRecordId` 指向的记录不可用于结清（不存在 / 非收到 / 已结清 / 不同联系人） |
| `RECORD_IMMUTABLE_FIELD` | 422 | 尝试修改 `contactId` / `direction` |
| `INVITE_NOT_FOUND` | 404 | token 不存在 |
| `INVITE_EXPIRED` | 410 | 邀请已过期 |
| `INVITE_USED` | 410 | 邀请已被使用 |
| `INVITE_REVOKED` | 410 | 邀请已撤销 |
| `FORBIDDEN` | 403 | 角色不足（如非 OWNER 改账本名） |
| `RATE_LIMITED` | 429 | 验证码 60 秒节流（登录验证码）/ Better Auth 内置限流 |
| `PRIVACY_PASSWORD_INVALID` | 422 | 隐私密码不正确 |
| `PRIVACY_LOCKED` | 429 | 隐私密码连续错误 5 次，锁定 1 分钟 |
| `INTERNAL_ERROR` | 500 | 未预期异常（`message` 统一为「服务器开小差了」） |

### 1.7 枚举字典

```ts
type RecordDirection = "GIVEN" | "RECEIVED";        // 送出 / 收到

type GiftScene =
  | "WEDDING"            // 婚礼
  | "BABY_FULL_MONTH"    // 满月
  | "BABY_HUNDRED_DAYS"  // 百岁
  | "FUNERAL"            // 白事
  | "OTHER";             // 其他

type MembershipRole = "OWNER" | "MEMBER";
```

服务端 DTO 同时返回 `sceneLabel`（中文），前端可直接展示，不必自己维护映射。

---

## 2. 接口总览

| # | 方法 | 路径 | 用途 | 需 ledgerId |
|---|---|---|---|---|
| 1 | POST | `/api/auth/phone-number/send-otp` | 发送验证码 | — |
| 2 | POST | `/api/auth/phone-number/verify` | 校验验证码并建立会话 | — |
| 3 | GET | `/api/auth/get-session` | 查询当前会话 | — |
| 4 | POST | `/api/auth/sign-out` | 退出登录 | — |
| 5 | GET | `/api/v1/me` | 当前用户 + 账本列表 | — |
| 6 | PATCH | `/api/v1/me` | 设置默认账本 | — |
| 7 | GET | `/api/v1/ledgers` | 我加入的账本列表 | — |
| 8 | POST | `/api/v1/ledgers` | 新建账本 | — |
| 9 | GET | `/api/v1/ledgers/{ledgerId}` | 账本详情 + 成员 | ✓ |
| 10 | PATCH | `/api/v1/ledgers/{ledgerId}` | 改账本名（OWNER） | ✓ |
| 11 | GET | `/api/v1/overview` | 账本汇总（首页用） | ✓ |
| 12 | GET | `/api/v1/contacts` | 联系人列表 / 模糊搜索 | ✓ |
| 13 | POST | `/api/v1/contacts` | 新建联系人 | ✓ |
| 14 | GET | `/api/v1/contacts/{contactId}` | 联系人详情 | ✓ |
| 15 | PATCH | `/api/v1/contacts/{contactId}` | 编辑联系人 | ✓ |
| 16 | DELETE | `/api/v1/contacts/{contactId}` | 删除联系人（软删） | ✓ |
| 17 | GET | `/api/v1/contacts/{contactId}/settlement` | **按人对账** | ✓ |
| 18 | GET | `/api/v1/records` | 记录列表（多条件） | ✓ |
| 19 | POST | `/api/v1/records` | 新建记录（可关联结清） | ✓ |
| 20 | GET | `/api/v1/records/{recordId}` | 记录详情 | ✓ |
| 21 | PATCH | `/api/v1/records/{recordId}` | 编辑记录 | ✓ |
| 22 | DELETE | `/api/v1/records/{recordId}` | 删除记录（软删） | ✓ |
| 23 | POST | `/api/v1/records/{recordId}/settle` | 手动结清 | ✓ |
| 24 | POST | `/api/v1/records/{recordId}/unsettle` | 反结清 | ✓ |
| 25 | GET | `/api/v1/pending-returns` | **待回礼列表** | ✓ |
| 26 | POST | `/api/v1/invites` | 生成邀请 | ✓ |
| 27 | GET | `/api/v1/invites/{token}` | 邀请详情（落地页） | — |
| 28 | POST | `/api/v1/invites/{token}/accept` | 接受邀请 | — |
| 29 | DELETE | `/api/v1/invites/{token}` | 撤销邀请 | — |
| 30 | GET | `/api/v1/health` | 健康检查 | — |

---

## 3. 认证（Better Auth 托管）

> **前端请使用 `authClient`，不要手拼路径**——路径由 Better Auth 插件决定，可能随版本变化。下表给出的是 1.7.x 的实际路径，仅作调试参考。

### 3.1 发送验证码

```ts
await authClient.phoneNumber.sendOtp({ phoneNumber: "+8613800000001" });
```

- 底层：`POST /api/auth/phone-number/send-otp`
- 入参：`phoneNumber`（**E.164**，必须带 `+86`）
- 出参：`{ "status": true }`
- 失败：`400`（手机号格式非法）、`429`（生产环境触发 Better Auth 内置限流）

**Mock 说明**：MVP 使用 mock 短信 provider，验证码只打到服务端日志。

- 开发 / 联调环境设置 `OTP_ALLOW_FIXED_CODE=true` 时，验证码固定为 `OTP_MOCK_CODE`（默认 `123456`），可直接联调；
- **生产环境不要设置该变量**，此时仍走 Better Auth 的真实随机码，只能从服务端日志取码——这是刻意的降级，不会静默放行任意验证码。

### 3.2 校验验证码并登录

```ts
await authClient.phoneNumber.verify({
  phoneNumber: "+8613800000001",
  code: "123456",
});
```

- 底层：`POST /api/auth/phone-number/verify`
- 成功：`200`，`Set-Cookie` 写入会话，响应体含 `token` / `user`
- 失败：`400`（验证码错误）、`403`（尝试次数超过 3 次，需重新发送）
- **首次验证自动注册**（`signUpOnVerification`）：同时创建 User + 默认账本 + OWNER 成员关系

### 3.3 查询会话 / 退出

```ts
await authClient.getSession(); // GET /api/auth/get-session
await authClient.signOut();    // POST /api/auth/sign-out
```

`getSession()` 返回 `null` 表示未登录。

### 3.4 POST /api/v1/auth/admin-login（内部账号）

登录框输入 `admin` 时走这里，不经过验证码。**仅内部使用**，`ALLOW_ADMIN_LOGIN !== "true"` 时直接返回 403。

入参：`{ "account": "admin" }`

出参 `200`：`{ "ok": true, "data": { "user": { ... } } }`，并在响应头下发会话 Cookie。

错误：`FORBIDDEN`（通道未开启）、`VALIDATION_ERROR`（账号不是 admin）。

> 前端不出现密码框，密码只在服务端使用。手机号输入框除 `admin` 外只接受数字，其他字母会被输入框拦截。

---

## 4. 用户与账本

### 4.1 GET /api/v1/me

当前用户信息 + 可切换的账本列表。**登录成功后前端第一个调用的接口。**

出参 `200`：

```json
{
  "ok": true,
  "data": {
    "user": {
      "id": "usr_demo_a",
      "name": "张伟",
      "phoneNumber": "+8613800000001",
      "createdAt": "2026-01-01T00:00:00.000Z"
    },
    "defaultLedgerId": "led_zhang",
    "ledgers": [
      {
        "id": "led_zhang",
        "name": "张家礼金账",
        "role": "OWNER",
        "memberCount": 2,
        "isDefault": true
      }
    ]
  }
}
```

> 若 `defaultLedgerId` 为 null（历史数据兜底），服务端会**自动创建**「我的礼金账本」并设为默认，保证该字段永不为 null。

### 4.2 PATCH /api/v1/me

设置默认账本（下次登录进入）。

入参：

```json
{ "defaultLedgerId": "led_li" }
```

出参 `200`：同 4.1 的 `data`。
错误：`LEDGER_FORBIDDEN`（不是该账本成员）。

### 4.3 GET /api/v1/ledgers

我加入的账本列表，含轻量统计。

出参 `200`：

```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "id": "led_zhang",
        "name": "张家礼金账",
        "role": "OWNER",
        "memberCount": 2,
        "contactCount": 7,
        "recordCount": 14,
        "isDefault": true,
        "createdAt": "2026-01-01T00:00:00.000Z"
      }
    ]
  }
}
```

### 4.4 POST /api/v1/ledgers

入参：

```json
{ "name": "王家礼金账" }
```

- `name`：1–50 字符，去首尾空格后非空
- 创建者自动成为 `OWNER` 成员
- 若该用户当前没有默认账本，自动设为默认

出参 `201`：

```json
{
  "ok": true,
  "data": {
    "ledger": { "id": "led_x", "name": "王家礼金账", "role": "OWNER", "memberCount": 1, "isDefault": false, "createdAt": "..." }
  }
}
```

### 4.5 GET /api/v1/ledgers/{ledgerId}

出参 `200`：

```json
{
  "ok": true,
  "data": {
    "ledger": {
      "id": "led_zhang",
      "name": "张家礼金账",
      "role": "OWNER",
      "createdAt": "...",
      "members": [
        { "userId": "usr_demo_a", "name": "张伟", "phoneNumberMasked": "138****0001", "role": "OWNER", "joinedAt": "..." },
        { "userId": "usr_demo_b", "name": "李娜", "phoneNumberMasked": "138****0002", "role": "MEMBER", "joinedAt": "..." }
      ]
    }
  }
}
```

> 手机号对其他成员一律脱敏，只有本人接口（4.1）返回完整号码。

### 4.6 PATCH /api/v1/ledgers/{ledgerId}

改账本名。**仅 OWNER 可调用**，MEMBER 调用返回 `403 FORBIDDEN`。

入参：`{ "name": "新名字" }` → 出参 `200`：`{ "ledger": {...} }`

### 4.7 GET /api/v1/overview

账本首页汇总。一次请求拿全首页数字，避免前端多次聚合。

出参 `200`：

```json
{
  "ok": true,
  "data": {
    "ledgerId": "led_zhang",
    "contactCount": 11,
    "recordCount": 47,
    "givenCount": 7,
    "receivedCount": 40,
    "givenTotalCents": 430000,
    "receivedTotalCents": 2610000,
    "netCents": 2180000,
    "pendingReturnCount": 5,
    "pendingReturnCents": 300000,
    "planCount": 3,
    "planCents": 260000,
    "eventCount": 6,
    "nextPlan": {
      "id": "plan_a_001", "contact": { "id": "con_a_006", "name": "周敏", "relationTag": "FRIEND" },
      "scene": "WEDDING", "sceneLabel": "婚礼", "plannedCents": 80000,
      "expectedAt": "2026-11-28", "daysUntil": 18, "status": "PLANNED"
    },
    "sceneBreakdown": [
      { "scene": "WEDDING", "sceneLabel": "婚礼", "count": 8, "totalCents": 480000 },
      { "scene": "BABY_FULL_MONTH", "sceneLabel": "满月", "count": 3, "totalCents": 110000 }
    ]
  }
}
```

口径：`contactCount` 只数未删除联系人；`recordCount` 只数未删除记录；`netCents = receivedTotalCents - givenTotalCents`；`sceneBreakdown` 按金额倒序，供前端画场景分布图。

`planCount` / `planCents` 只统计**预备中**（`status=PLANNED` 且未删除）的人情预备；`nextPlan` 是预计日期最近的一笔（完整 `Plan` 对象，字段见 §10），没有则为 `null`。**预备金额不计入 `givenTotalCents` / `netCents` / `pendingReturn*`**——它只是计划，不是已发生的账。

---

## 5. 联系人

### 5.1 GET /api/v1/contacts

查询参数：

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `q` | string | — | 姓名模糊搜索（大小写不敏感，`ILIKE %q%`），1–30 字符 |
| `sort` | `recent` \| `name` | `recent` | `recent` = 最近有礼金往来优先（无记录排最后）；`name` = 姓名升序 |
| `page` / `pageSize` | int | 1 / 20 | — |

出参 `200`（`items` 每项 = 联系人基础字段 + `stats`）：

```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "id": "con_a_001",
        "name": "王建国",
        "relationTag": "FATHER_SIDE",
        "phone": null,
        "note": null,
        "createdAt": "...",
        "updatedAt": "...",
        "stats": {
          "givenTotalCents": 80000,
          "receivedTotalCents": 130000,
          "netCents": 50000,
          "recordCount": 3,
          "unsettledReceivedCount": 1,
          "unsettledReceivedCents": 50000,
          "lastRecordAt": "2026-03-08"
        }
      }
    ],
    "page": 1,
    "pageSize": 20,
    "total": 7
  }
}
```

> `stats` 恒返回（MVP 数据规模下开销可忽略），前端列表页可直接展示净差额。

### 5.2 POST /api/v1/contacts

入参：

```json
{ "name": "王建国", "relationTag": "FATHER_SIDE", "phone": "13900000001", "note": "二舅" }
```

| 字段 | 必填 | 规则 |
|---|---|---|
| name | ✓ | 1–30 字符，去空格后非空；同账本内未删除联系人不得重名 |
| relationTag | — | 亲友分组枚举：`FATHER_SIDE` / `MOTHER_SIDE` / `PRIMARY_SCHOOL` / `JUNIOR_SCHOOL` / `HIGH_SCHOOL` / `COLLEGE` / `COLLEAGUE` / `FRIEND` / `OTHER`，或 `null` |
| phone | — | ≤20 字符，不做格式校验 |
| note | — | ≤200 字符 |

出参 `201`：`{ "contact": { ...基础字段, "stats": { 全 0 } } }`
错误：`CONTACT_NAME_DUPLICATE`（409）

### 5.3 GET /api/v1/contacts/{contactId}

出参 `200`：`{ "contact": { ...基础字段, "stats": {...} } }`
错误：`NOT_FOUND`（不存在 / 属于别的账本 / 已软删除）

### 5.4 PATCH /api/v1/contacts/{contactId}

入参（全部可选，至少传一个）：`{ "name"?, "relationTag"?, "phone"?, "note"? }`

- `null` 表示清空该字段（`name` 除外）
- 改名撞重复 → `CONTACT_NAME_DUPLICATE`（409）

出参 `200`：`{ "contact": {...} }`

### 5.5 DELETE /api/v1/contacts/{contactId}

软删除。**不删除其礼金记录**，历史记录仍计入统计、仍可通过 `/records?contactId=` 查到。

出参 `200`：

```json
{ "ok": true, "data": { "deleted": true, "recordCount": 3 } }
```

`recordCount` = 该联系人名下未删除记录数，供前端二次确认文案使用（「该联系人下有 3 条记录，删除后记录仍会保留」）。

---

## 6. 按人对账

### 6.1 GET /api/v1/contacts/{contactId}/settlement

给定联系人，返回**全部双向流水 + 净差额**。

查询参数（可选）：`from`、`to`（`YYYY-MM-DD`，按 `occurredAt` 过滤；不传则全量）。

出参 `200`：

```json
{
  "ok": true,
  "data": {
    "contact": { "id": "con_a_001", "name": "王建国", "relationTag": "FATHER_SIDE" },
    "summary": {
      "givenTotalCents": 80000,
      "receivedTotalCents": 130000,
      "netCents": 50000,
      "givenCount": 1,
      "receivedCount": 2,
      "unsettledReceivedCount": 1,
      "unsettledReceivedCents": 50000,
      "firstOccurredAt": "2025-10-01",
      "lastOccurredAt": "2026-03-08"
    },
    "records": [
      { "id": "rec_a_0001", "direction": "RECEIVED", "amountCents": 80000, "amountYuan": "800.00", "scene": "WEDDING", "sceneLabel": "婚礼", "occurredAt": "2025-10-01", "note": null, "isSettled": true, "settledAt": "2026-01-15T02:00:00.000Z", "settledByRecordId": "rec_a_0013", "settlesRecordId": null },
      { "id": "rec_a_0013", "direction": "GIVEN", "amountCents": 80000, "amountYuan": "800.00", "scene": "WEDDING", "sceneLabel": "婚礼", "occurredAt": "2026-01-15", "note": "回礼", "isSettled": false, "settledAt": null, "settledByRecordId": null, "settlesRecordId": "rec_a_0001" }
    ],
    "truncated": false
  }
}
```

- `records` 按 `occurredAt` 倒序、`createdAt` 倒序，**不分页**（单人流水量级 < 100；服务端硬上限 500 条，超出截断并置 `truncated: true`，前端应提示「仅展示最近 500 条」）。
- `netCents = receivedTotalCents - givenTotalCents`，正数表示我方收得多、欠对方人情。

### 6.2 记录 DTO（全接口统一）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | — |
| ledgerId | string | — |
| contactId | string | — |
| contact | `{id,name,relationTag}` | 列表接口内联，减少前端二次请求 |
| direction | `GIVEN` \| `RECEIVED` | — |
| amountCents | int | 分 |
| amountYuan | string | 展示用，两位小数 |
| scene / sceneLabel | enum / string | 场景 + 中文名 |
| occurredAt | `YYYY-MM-DD` | — |
| note | string \| null | — |
| isSettled | boolean | 由 `settledAt != null` 派生 |
| settledAt | ISO \| null | — |
| settledByRecordId | string \| null | 本条（收到）被哪条送出记录结清；手动结清为 null |
| settlesRecordId | string \| null | 本条（送出）结清了哪条收到记录 |
| createdAt / updatedAt | ISO | — |

---

## 7. 记录

### 7.1 GET /api/v1/records

查询参数（全部可选）：

| 参数 | 类型 | 说明 |
|---|---|---|
| `contactId` | string | 按联系人过滤 |
| `direction` | `GIVEN`\|`RECEIVED` | 按方向过滤 |
| `scene` | `GiftScene` | 按场景过滤 |
| `settled` | `true`\|`false` | 按结清状态过滤。**使用该参数时自动隐含 `direction=RECEIVED`**（送出记录没有结清概念），与显式 `direction=GIVEN` 同时传会得到空列表 |
| `from` / `to` | `YYYY-MM-DD` | 按 `occurredAt` 闭区间过滤 |
| `page` / `pageSize` | int | 默认 1 / 20 |

默认按 `occurredAt desc, createdAt desc` 排序。已软删除的记录永不返回。

出参 `200`：标准分页信封，`items` 为记录 DTO。

### 7.2 POST /api/v1/records

入参：

```json
{
  "contactId": "con_a_001",
  "direction": "GIVEN",
  "amountCents": 80000,
  "scene": "WEDDING",
  "occurredAt": "2026-01-15",
  "note": "回礼",
  "settlesRecordId": "rec_a_0001"
}
```

| 字段 | 必填 | 规则 |
|---|---|---|
| contactId | ✓ | 必须属于当前账本且未删除，否则 `NOT_FOUND` |
| direction | ✓ | `GIVEN` / `RECEIVED` |
| amountCents | ✓ | 整数，1 – 10,000,000（10 万元） |
| scene | ✓ | 枚举值 |
| occurredAt | ✓ | `YYYY-MM-DD`，不早于 1950-01-01，不晚于今天 + 1 年 |
| note | — | ≤200 字符 |
| settlesRecordId | — | **仅 `direction = GIVEN` 时允许**。目标必须：属于当前账本、未删除、方向为 `RECEIVED`、`settledAt` 为 null、`contactId` 与本次相同 |
| settled | — | **仅 `direction = RECEIVED` 时允许**。`true` = 创建即已结清（补录老账），写入 `settledAt = now()` |

约束：
- `settlesRecordId` 与 `settled` 不能同时出现 → `VALIDATION_ERROR`
- 关联结清在一个事务内完成：创建 GIVEN 记录 → 更新目标 RECEIVED 的 `settledAt` / `settledByRecordId`

出参 `201`：

```json
{
  "ok": true,
  "data": {
    "record": { ...新记录 DTO },
    "settledRecord": { ...被结清的收到记录 DTO } 
  }
}
```

未关联结清时 `settledRecord` 为 `null`。

错误：`SETTLE_TARGET_INVALID`（422）、`NOT_FOUND`（联系人不存在）、`VALIDATION_ERROR`

> **「记一笔」的日期分流约定（前端）**
> 记一笔弹层里，日期 **> 今天** 时默认改调 `POST /api/v1/plans`（创建人情预备，`expectedAt` = 所选日期），
> 标题与按钮文案同步变为「加入人情预备 / 加入预备」，并提示「不计入当前收支」。
> 日期 **≤ 今天** 时走本接口。用户可手动切换去向；选择「关联待回礼」时强制走本接口（预备不能结清）。
> 因此：**未来日期不会出现在账簿记录里**，只会出现在「人情预备」。

### 7.3 GET /api/v1/records/{recordId}

出参 `200`：`{ "record": {...} }`；不存在 / 跨账本 → `NOT_FOUND`

### 7.4 PATCH /api/v1/records/{recordId}

入参（全部可选，至少一个）：`{ "amountCents"?, "scene"?, "occurredAt"?, "note"? }`

- **`contactId` 与 `direction` 不可修改**：传了直接 `422 RECORD_IMMUTABLE_FIELD`（要改归属请删除后重建，避免结清关系错乱）
- 修改金额不影响结清状态

出参 `200`：`{ "record": {...} }`

### 7.5 DELETE /api/v1/records/{recordId}

软删除，并在同一事务内处理结清关系：

- 删除的是 **GIVEN** 且它结清过某条 RECEIVED → 目标 RECEIVED 回退为未结清
- 删除的是 **RECEIVED** 且被某条 GIVEN 结清过 → 该 RECEIVED 的 `settledByRecordId` 一并清空；GIVEN 记录保留不变

出参 `200`：

```json
{ "ok": true, "data": { "deleted": true, "relatedRecordId": "rec_a_0001" } }
```

`relatedRecordId` 是这次删除波及的另一条记录：删 GIVEN 时指向被回退的 RECEIVED；删 RECEIVED 时指向原先结清它的 GIVEN（该 GIVEN 本身不变）。无关联时为 `null`。前端在删除「用于结清」的送出记录时应二次确认（提示「对应收礼将恢复为待回礼」）。

### 7.6 POST /api/v1/records/{recordId}/settle

手动结清一条「收到」记录（不关联具体送出记录）。

- 记录不存在 / 跨账本 → `NOT_FOUND`
- 方向为 `GIVEN` → `409 RECORD_NOT_SETTLEABLE`
- 已结清 → `409 RECORD_ALREADY_SETTLED`

出参 `200`：`{ "record": {...} }`（`isSettled: true`，`settledByRecordId: null`）

### 7.7 POST /api/v1/records/{recordId}/unsettle

反结清（撤销误操作）。

- 未结清 → `409 RECORD_NOT_SETTLED`
- 清空 `settledAt` 与 `settledByRecordId`；若原先是「关联结清」，那条 GIVEN 记录的 `settlesRecordId` 同步变为 null

出参 `200`：`{ "record": {...} }`

---

## 8. 待回礼

### 8.1 GET /api/v1/pending-returns

返回 `direction = RECEIVED` 且 `settledAt IS NULL` 且未删除的记录，按 `occurredAt` **升序**（拖得最久的排最前）。

查询参数：`contactId`（可选）、`page` / `pageSize`。

出参 `200`：

```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "id": "rec_a_0003",
        "contact": { "id": "con_a_002", "name": "刘芳", "relationTag": "FATHER_SIDE" },
        "amountCents": 100000,
        "amountYuan": "1000.00",
        "scene": "WEDDING",
        "sceneLabel": "婚礼",
        "occurredAt": "2025-05-20",
        "daysSince": 539,
        "note": null
      }
    ],
    "page": 1,
    "pageSize": 20,
    "total": 5,
    "summary": { "totalCount": 5, "totalCents": 300000 }
  }
}
```

- `daysSince`：距今天数，服务端计算，避免前端时区问题
- `summary` 统计的是**全部符合条件的记录**，不是当前页

---

## 9. 邀请

### 9.1 POST /api/v1/invites

需要 `X-Ledger-Id`。**任意账本成员都可邀请**（家庭场景，不做限制）。

入参：`{ "expiresInDays": 7 }`（可选，默认 7，范围 1–30）

出参 `201`：

```json
{
  "ok": true,
  "data": {
    "invite": {
      "token": "3f9c2a7d5e1b8c4f6a0d2e9b7c5f1a3d",
      "url": "https://your-app.vercel.app/invite/3f9c2a7d5e1b8c4f6a0d2e9b7c5f1a3d",
      "expiresAt": "2026-11-17T03:00:00.000Z"
    }
  }
}
```

`url` 的域名取自 `NEXT_PUBLIC_APP_URL`，前端可直接复制/分享。

### 9.2 GET /api/v1/invites/{token}

邀请落地页用。需登录（未登录先引导登录，登录后再调）。

出参 `200`：

```json
{
  "ok": true,
  "data": {
    "invite": {
      "token": "3f9c...",
      "status": "PENDING",
      "ledger": { "id": "led_zhang", "name": "张家礼金账", "memberCount": 2 },
      "inviterName": "张伟",
      "expiresAt": "2026-11-17T03:00:00.000Z"
    },
    "alreadyMember": false
  }
}
```

`status`：`PENDING` / `USED` / `EXPIRED` / `REVOKED`。
错误：`INVITE_NOT_FOUND`（404）。**已过期/已用/已撤销不报错**，通过 `status` 表达，便于落地页展示不同文案。

### 9.3 POST /api/v1/invites/{token}/accept

入参：无 body。

行为：
1. token 不存在 → `404 INVITE_NOT_FOUND`
2. `status != PENDING` → `410`（`INVITE_EXPIRED` / `INVITE_USED` / `INVITE_REVOKED`）
3. 已是该账本成员 → **不报错**，返回 `alreadyMember: true`（幂等，且不消耗 token）
4. 否则：事务内创建 `Membership(MEMBER)` + 写入 `usedAt` / `usedByUserId`

出参 `200`：

```json
{
  "ok": true,
  "data": {
    "ledger": { "id": "led_zhang", "name": "张家礼金账", "role": "MEMBER", "memberCount": 3 },
    "alreadyMember": false
  }
}
```

> 接受邀请**不会**改变 `defaultLedgerId`。前端应在成功后就地切换 `X-Ledger-Id` 并刷新页面数据。

### 9.4 DELETE /api/v1/invites/{token}

撤销。仅**邀请创建者**或**账本 OWNER** 可调用，否则 `403 FORBIDDEN`。

出参 `200`：`{ "revoked": true }`；已撤销则幂等返回 `{ "revoked": true }`。

---

## 10. 人情预备（GiftPlan）

> 场景：已知未来某场红白事（同学下月结婚、亲戚明年满月），提前把礼金备出来。
> **预备只是计划，不计入任何收支统计**；标记完成时才可选择生成一条真实的 `Record`。

### 10.1 Plan DTO（全接口统一）

```json
{
  "id": "plan_a_001",
  "ledgerId": "led_zhang",
  "contactId": "con_a_006",
  "contact": { "id": "con_a_006", "name": "周敏", "relationTag": "FRIEND" },
  "direction": "GIVEN",
  "scene": "WEDDING",
  "sceneLabel": "婚礼",
  "plannedCents": 80000,
  "plannedYuan": "800.00",
  "expectedAt": "2026-11-28",
  "daysUntil": 18,
  "status": "PLANNED",
  "note": "儿子婚宴",
  "recordId": null,
  "completedAt": null,
  "createdAt": "2026-11-10T08:31:28.290Z"
}
```

- `daysUntil`：距预计日期的天数，正数=未来、`0`=今天、负数=已过期（**不自动改状态**，由用户决定完成或删除）。
- `status`：`PLANNED`（预备中）/ `DONE`（已完成）。
- `recordId`：完成时生成的真实礼金记录 ID；只标记完成不记账则为 `null`。

### 10.2 GET /api/v1/plans

**上下文**：需要 `X-Ledger-Id`。

入参（query）：

| 参数 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `status` | `PLANNED` \| `DONE` \| `ALL` | `PLANNED` | 状态过滤 |
| `contactId` | string | — | 只看某位亲友 |
| `page` / `pageSize` | int | `1` / `50` | 分页，`pageSize` 上限 100 |

出参 `200`：标准分页信封 `{ items: Plan[], page, pageSize, total }`。
排序：`PLANNED` 按 `expectedAt` 升序（最近的事排最前）；`DONE` 按 `completedAt` 倒序。

### 10.3 POST /api/v1/plans

**上下文**：需要 `X-Ledger-Id`。

入参：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `contactId` | string | ✅ | 必须属于当前账本且未删除 |
| `direction` | `GIVEN` \| `RECEIVED` | — | 默认 `GIVEN`；也支持「预计收到」 |
| `scene` | `WEDDING` \| `BABY_FULL_MONTH` \| `BABY_HUNDRED_DAYS` \| `FUNERAL` \| `OTHER` | ✅ | 礼俗场景 |
| `plannedCents` | int | ✅ | 预计金额（分），`> 0` 且 `<= 10_000_000` |
| `expectedAt` | `YYYY-MM-DD` | ✅ | 预计日期，范围 1950-01-01 ～ 今天起 5 年内 |
| `note` | string | — | 事由，最长 200 字 |

出参 `201`：`{ "plan": Plan }`。
错误：`400 VALIDATION_ERROR`（字段非法）、`404 NOT_FOUND`（联系人不存在或属于别的账本）。

### 10.4 GET /api/v1/plans/{planId}

**上下文**：需要 `X-Ledger-Id`。出参 `200`：`{ "plan": Plan }`。
错误：`404 NOT_FOUND`（不存在 / 已删除 / **属于别的账本**——不泄露资源存在性）。

### 10.5 PATCH /api/v1/plans/{planId}

**上下文**：需要 `X-Ledger-Id`。`direction` / `scene` / `plannedCents` / `expectedAt` / `note` 任选至少一个；`note` 传 `null` 可清空。

出参 `200`：`{ "plan": Plan }`。
错误：`400 VALIDATION_ERROR`（一个字段都没给）、`404 NOT_FOUND`、`409 CONFLICT`（**已完成的预备不允许再改**）。

> `contactId` 创建后不可改：换人等于换一笔事，请删除重建。

### 10.6 DELETE /api/v1/plans/{planId}

**上下文**：需要 `X-Ledger-Id`。**软删除**，不级联删除已生成的 `Record`。
出参 `200`：`{ "deleted": true }`；错误：`404 NOT_FOUND`。

### 10.7 POST /api/v1/plans/{planId}/complete

**上下文**：需要 `X-Ledger-Id`。请求体可省略（默认行为：记一笔真实礼金）。

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `createRecord` | boolean | `true` | 是否同时生成 `Record`；礼金早已单独记过时传 `false` |
| `occurredAt` | `YYYY-MM-DD` | 今天 | 实际发生日期（仅 `createRecord=true` 有效） |
| `amountCents` | int | `plannedCents` | 实际金额，允许与预计不同（仅 `createRecord=true` 有效） |

出参 `200`：

```json
{
  "ok": true,
  "data": {
    "plan": { "...": "status: DONE, recordId: 'clx...', completedAt: '2026-11-28T...' " },
    "record": { "...": "标准 Record DTO；createRecord=false 时为 null" }
  }
}
```

- 生成记录与状态更新在**同一个事务**内，不会留下「记录有了但预备还在预备中」的半成品。
- 生成的 `Record` 沿用预备的 `contactId` / `direction` / `scene` / `note`，但金额与日期以入参为准。
- 完成后 `planCount` / `planCents` 立即减少，`overview.nextPlan` 顺延到下一笔。
- 错误：`404 NOT_FOUND`、`409 CONFLICT`（重复完成）、`400 VALIDATION_ERROR`。

### 10.8 典型流程

```
1. POST /api/v1/plans            → 新建预备（首页出现「人情预备」标签与计数）
2. GET  /api/v1/overview         → planCount / planCents / nextPlan 供首页展示
3. 事情办完 → POST /api/v1/plans/{id}/complete
      { "createRecord": true, "amountCents": 88000, "occurredAt": "2026-11-28" }
   → 预备变 DONE，同时生成一条 GIVEN 记录，进入对账与净差额
4. GET  /api/v1/plans?status=DONE → 已完成清单，可跳到对应联系人查对账
```

---

## 11. 隐私模式（敏感信息遮罩）

> 默认状态：**锁定**。界面上的金额与人名都由前端展示层遮罩，用户输入隐私密码后才能查看真实值。
> 密码默认 `331633`，可用服务端环境变量 `PRIVACY_PASSWORD` 覆盖。解锁状态由服务端签发的 httpOnly Cookie 决定，前端无法伪造；有效期 8 小时，可随时主动上锁。

### 11.1 遮罩规则（前端统一实现）

| 类型 | 锁定态 | 解锁态 | 说明 |
|---|---|---|---|
| 金额 | `¥*,***` | `¥4,300` | 每个数字字符替换为 `*`，保留 `¥`、千分位、小数点、负号；位数与真实金额一致 |
| 人名 | `王` | `王建国` | 只保留姓氏；复姓（欧阳、司马等）保留两字 |
| 备注 | 数字替换为 `*` | 原文 | 防止从备注里读到金额 |
| 手机号 | `138****0001` | 同左 | 手机号始终打码，解锁也不还原 |

示例：`¥400` → `¥***`（三个星号）；`¥20` → `¥**`（两个星号）。

**边界说明**：这是**展示层**隐私模式，用于防止旁人窥屏；接口本身仍受登录会话与账本成员校验保护，未登录无法调用。已登录用户通过 DevTools 仍可读到自己有权访问的原始数据。

### 11.2 GET /api/v1/privacy/status

查询当前会话的解锁状态。

出参 `200`：

```json
{ "ok": true, "data": { "unlocked": false, "expiresAt": null } }
```

### 11.3 POST /api/v1/privacy/verify

校验隐私密码并解锁。

入参：`{ "password": "331633" }`
出参 `200`：`{ "unlocked": true, "expiresAt": "2026-11-10T19:14:01.577Z" }`

- 密码由服务端环境变量 `PRIVACY_PASSWORD` 配置（默认 `331633`），**只存在服务端**，不进入前端打包产物。
- 比对使用 SHA-256 摘要 + `timingSafeEqual`，避免明文比较与时序攻击。
- 连续输错 **5 次**锁定 1 分钟，返回 `429 PRIVACY_LOCKED`；成功一次即清零。
- 成功后服务端下发 `gd_privacy` Cookie（httpOnly / sameSite=lax / 8 小时，HMAC 签名并绑定 userId）。
- 错误：`422 PRIVACY_PASSWORD_INVALID`（密码错误，message 会提示剩余次数）、`429 PRIVACY_LOCKED`（锁定中）。

### 11.4 POST /api/v1/privacy/lock

主动重新上锁，清除 Cookie。

出参 `200`：`{ "unlocked": false, "expiresAt": null }`

### 11.5 前端约定

- 顶部栏有**独立**的「隐私模式 / 真实数据已显示」按钮，与记账、账本等操作分开。
- 锁定态下点击「编辑亲友档案」「修改预备」「完成预备」会直接弹出密码框，避免预填的真实姓名/金额泄露。
- 解锁后无需刷新页面，所有已渲染的金额与人名立即还原（React Context 驱动）。
- 切换账号、Cookie 过期、主动上锁都会回到遮罩状态。

---

## 12. 典型调用序列

### 12.1 首次登录

```
1. authClient.phoneNumber.sendOtp({ phoneNumber: "+8613800000001" })
2. authClient.phoneNumber.verify({ phoneNumber, code })
   → 服务端：创建 User + 默认账本「我的礼金账本」+ OWNER membership + defaultLedgerId
3. GET /api/v1/me
   → 拿到 defaultLedgerId，前端把 X-Ledger-Id 设为它
4. GET /api/v1/overview  → 首页数字
```

### 12.2 记一笔回礼并结清

```
1. GET /api/v1/contacts/{id}/settlement   → 看到那条未结清的 RECEIVED（rec_a_0001）
2. POST /api/v1/records
   { contactId, direction: "GIVEN", amountCents: 80000, scene: "WEDDING",
     occurredAt: "2026-01-15", settlesRecordId: "rec_a_0001" }
   → 201，返回 record + settledRecord
3. GET /api/v1/pending-returns            → 该条已消失
```

### 12.3 邀请家人

```
1. POST /api/v1/invites (X-Ledger-Id: led_zhang)  → token / url
2. 分享链接 → 对方登录 → GET /api/v1/invites/{token} 展示账本名
3. POST /api/v1/invites/{token}/accept  → 成为 MEMBER
4. 对方 GET /api/v1/ledgers → 列表里出现该账本
```

---

## 13. 成员管理与导出

### 13.1 DELETE /api/v1/ledgers/{ledgerId}/members/me

退出账本。需要登录，账本 ID 在路径里。

- `MEMBER`：直接退出。若退出的是默认账本，`defaultLedgerId` 自动指向剩余的第一本。
- `OWNER`：返回 `409 CONFLICT`，必须先转让管理员。

```json
{ "ok": true, "data": { "left": true } }
```

### 13.2 POST /api/v1/ledgers/{ledgerId}/transfer

转让管理员，仅 `OWNER` 可调用。

```json
{ "userId": "usr_xxx" }
```

- 目标必须是本账本成员，否则 `404 NOT_FOUND`
- 不能转让给自己，`422 VALIDATION_ERROR`
- 并发下用条件更新抢占，只有一个请求能成功

```json
{ "ok": true, "data": { "transferred": true, "newOwnerId": "usr_xxx" } }
```

### 13.3 GET /api/v1/export

导出账本全量数据。**要求隐私模式已解锁**，否则 `403 FORBIDDEN`——出参含真实姓名与金额。

出参 `data.export`：

| 字段 | 说明 |
|---|---|
| `formatVersion` | 当前为 `1` |
| `exportedAt` | 导出时间 |
| `ledger` | 账本基本信息 |
| `members` | 成员（不含手机号） |
| `contacts` | 未删除的亲友 |
| `records` | 未删除的记录，含 `amountCents` / `amountYuan` / `sceneLabel` / `occurredAt` |
| `plans` | 未删除的人情预备 |

单次上限 20000 笔记录，超出返回 `409 CONFLICT`。

---

## 14. 人生大事（LifeEvent）

以个人为中心的时间线：一场婚礼、一次满月、一场寿宴。礼金记录可以挂到某场事下，
用来回答「这场事收了多少、都有谁」。

### 14.1 数据结构

| 字段 | 说明 |
|---|---|
| `title` | 事件名称，如「我的婚礼」 |
| `scene` | 复用礼俗场景枚举 |
| `occurredAt` | 发生日期 `YYYY-MM-DD` |
| `location` / `note` | 选填 |
| `hosted` | 是否我方主办，默认 `true` |
| `summary` | 汇总：`receivedTotalCents` / `givenTotalCents` / `netCents` / `recordCount` / `participantCount` / `maxReceivedCents` |

### 14.2 GET /api/v1/events

按 `occurredAt` 倒序，需要 `X-Ledger-Id`。

```
GET /api/v1/events?page=1&pageSize=20
→ { items: LifeEvent[], total, page, pageSize }
```

`participantCount` 是按 `(eventId, contactId)` 去重后的人数，不是记录条数。

### 14.3 POST /api/v1/events

```json
{ "title": "我的婚礼", "scene": "WEDDING", "occurredAt": "2025-05-20",
  "location": "老家县城", "note": "办了 20 桌" }
```

→ `201 { event }`

### 14.4 GET /api/v1/events/{id}

→ `{ event, records: RecordDto[] }`，`records` 为挂在该事件下的礼金明细。

### 14.5 PATCH / DELETE

- `PATCH` 字段与创建相同，至少提供一个。
- `DELETE` 为软删除，**礼金记录不删除**，只把 `eventId` 置 `null`，
  返回 `{ deleted: true, detachedRecordCount }`。

### 14.6 记录如何关联事件

`POST /records` 与 `PATCH /records/{id}` 都支持 `eventId`：

- 创建时传 `eventId` 即挂到该事件下
- 更新时传 `null` 解除关联
- 事件必须属于当前账本，否则返回 `404`

---

## 15. 前端对接注意

1. **每个账本内请求都要带 `X-Ledger-Id`**。建议封装一个 `apiFetch(path, { ledgerId, ... })`，在拦截器里统一注入；切换账本时只改这一个状态。
2. **切换账本后必须丢弃旧数据**。所有列表都按 `ledgerId` 隔离，不要把上一个账本的结果留在缓存里。
3. **金额只传分**。输入框用「元」，提交前 `Math.round(Number(v) * 100)`，并校验 `Number.isInteger`。
4. **日期只传 `YYYY-MM-DD`**。不要传 `Date` 对象或带时区的 ISO 串。
5. **错误处理按 `error.code` 分支，不要按 `message` 文本**。`message` 仅供展示。
6. **`403 LEDGER_FORBIDDEN` 与 `404 NOT_FOUND` 语义不同**：前者是「你没权限」，应提示切换账本或返回首页；后者是「这条数据没了」，应刷新列表。
7. 会话过期（`401`）时统一跳登录页，不要在每个页面各写一遍。
