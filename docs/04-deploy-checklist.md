# 04 · 部署检查清单（Vercel + Neon）

> 这是一份**操作清单**，不是「已经跑通」的证明。截至 2026-11，本项目未在真实 Neon + 真实短信环境下完成一次完整上线；第 6 节列出了尚未验证的项。
>
> 每一步都写了「怎么验」，不要凭感觉跳过。

---

## 1. 前置准备

- [ ] Neon 建库（PostgreSQL 16），拿到两条连接串：
  - **pooled**（主机名带 `-pooler`）→ `DATABASE_URL`（运行时）
  - **direct**（不带 pooler）→ `DIRECT_URL`（迁移）
- [ ] Vercel 导入仓库，Framework 自动识别为 Next.js
- [ ] Node 版本 22（Project Settings → General）
- [ ] 准备生产域名，并确认 `https://` 可访问
- [ ] 腾讯云短信：签名、模板审核通过（个人主体通常无法申请签名，见 `docs/05-sms-setup.md`）
- [ ] 生成生产专用密钥：`openssl rand -base64 32`（不要复用本地 `.env` 里的值）

---

## 2. 环境变量

### 2.1 必填

| 变量 | 说明 | 怎么验 |
|---|---|---|
| `APP_ENV` | 固定 `production` | 启动日志应打印「生产环境配置检查通过」 |
| `DATABASE_URL` | Neon pooled 串 | `/api/v1/health` 返回 `db: "up"` |
| `DIRECT_URL` | Neon direct 串 | `prisma migrate status` 能连上 |
| `BETTER_AUTH_SECRET` | ≥32 字符，生产专用 | 登录后会话能保持；隐私解锁 Cookie 可签发 |
| `BETTER_AUTH_URL` | `https://<域名>` | 登录不报 Invalid origin |
| `NEXT_PUBLIC_APP_URL` | 邀请链接域名，通常同上 | 生成的邀请链接域名正确 |
| `PRIVACY_PASSWORD` | ≥8 位，非重复 / 连续 / 常见弱口令 | 顶栏隐私模式能解锁；缺配置会 503 |
| `SMS_PROVIDER` | `tencent` | 点「获取验证码」能收到真实短信 |
| `TENCENT_SMS_SECRET_ID` | 访问密钥 | — |
| `TENCENT_SMS_SECRET_KEY` | 访问密钥 | — |
| `TENCENT_SMS_SDK_APP_ID` | 1400 开头 | — |
| `TENCENT_SMS_SIGN_NAME` | 审核通过的签名，不带【】 | 短信能送达 |
| `TENCENT_SMS_TEMPLATE_ID` | 模板数字 ID | 短信内容正确 |
| `TENCENT_SMS_REGION` | 默认 `ap-guangzhou` | — |

### 2.2 必须删除或设为 false

| 变量 | 原因 |
|---|---|
| `OTP_ALLOW_FIXED_CODE` | 否则任何人都能用 `123456` 登录 |
| `ALLOW_ADMIN_LOGIN` | 否则 `admin` 通道整体开放 |
| `ALLOW_LAN_ACCESS` | 只用于本地手机联调 |
| `NEXT_PUBLIC_SHOW_DEMO_HINT` | 生产构建默认隐藏；不要强制打开 |

> 代码里有启动自检：以上任意一个为 `true`，或者 `SMS_PROVIDER=mock`、`PRIVACY_PASSWORD` 缺失/过弱，服务会**拒绝启动**并打印问题列表。看到启动失败先按提示补配置，不要临时关掉校验。

### 2.3 建议

- [ ] 在 Neon 控制台开启 **IP Allow**（如果使用固定出口 IP）或依赖 SSL
- [ ] Vercel 环境变量按 Production / Preview / Development 分环境配置，Preview 不要连生产库
- [ ] `NEXT_PUBLIC_*` 会被打进前端产物，确认其中没有密钥

---

## 3. 构建与迁移

- [ ] Install Command：`npm ci`
- [ ] Build Command：`npm run build`（内部会 `prisma generate && next build`）
- [ ] **迁移不要放进 Build Command**：并发构建会重复执行，且失败会阻塞发布
- [ ] 在本地或 CI 单独执行：

```bash
DIRECT_URL="<Neon direct 串>" npx prisma migrate deploy
```

- [ ] 确认迁移版本：

```bash
DIRECT_URL="<Neon direct 串>" npx prisma migrate status
```

- [ ] **不要在生产库执行 `prisma db seed`**。脚本在 `NODE_ENV=production` 时默认拒绝，除非显式 `ALLOW_SEED=true`。

---

## 4. 上线后逐项验证

用两个真实手机号（A、B）走一遍：

### 4.1 基础可用

- [ ] `GET /api/v1/health` 返回 `{"ok":true,"data":{"status":"ok","db":"up"}}`
- [ ] 打开首页 → 未登录跳转 `/login`，页面无报错
- [ ] A 输入手机号 → **能收到真实短信**（不是日志里的码）
- [ ] 输入验证码 → 进入首页，自动创建默认账本
- [ ] 新建亲友 → 记一笔收礼 → 首页「累计收到」增加

### 4.2 核心业务

- [ ] 记一笔送礼并关联结清 → 待回礼减少 1 笔
- [ ] 删除那笔送礼 → 待回礼恢复 1 笔（验证结清回退）
- [ ] 新建一笔人情预备 → 标记完成并记账 → 亲友对账里出现真实记录
- [ ] 人生大事：建事件 → 把记录归类 → 汇总金额正确

### 4.3 共享与隔离

- [ ] 生成邀请链接 → 用 B 的手机打开 → 接受后成为记账员
- [ ] B 能看到 A 的账本与记录
- [ ] 用 B 的账号访问 A 的另一本账本 → 返回 403 `LEDGER_FORBIDDEN` 或 404

### 4.4 安全

- [ ] 首页金额默认 `¥*,***`，输入隐私密码后显示真实值
- [ ] 隐私模式未解锁时点「导出」→ 提示先解锁
- [ ] 连续输错 5 次隐私密码 → 锁定 1 分钟
- [ ] `curl -I https://<域名>/login` 能看到 `content-security-policy`、`x-frame-options`、`referrer-policy`
- [ ] 生产环境用 `123456` 登录失败（固定码已禁用）
- [ ] 生产环境访问 `/api/v1/auth/admin-login` 返回 403

---

## 5. 备份、恢复与回滚

### 5.1 备份

- [ ] Neon 开启 **Point-in-Time Restore**（默认保留窗口按套餐）
- [ ] 上线前手动记一次时间点或创建快照
- [ ] 业务侧导出：解锁隐私模式 → `/ledger` → 导出 JSON，作为逻辑备份留存

### 5.2 恢复

1. Neon 控制台按时间点创建新分支（不要直接覆盖生产）；
2. 把新分支的连接串临时配到 Preview 环境；
3. 在 Preview 验证数据完整（登录、账本、记录数、结清状态）；
4. 确认无误后把生产切换到恢复分支，或导出 SQL 回灌生产。

> 恢复演练尚未执行过。第一次演练建议在独立 Neon 分支上进行，不要拿生产库试。

### 5.3 回滚

- **代码**：Vercel → Deployments → 选中上一个正常版本 → Promote to Production
- **迁移**：Prisma 迁移没有自动回滚。回滚代码前先确认新迁移是否改变了表结构：
  - 只加表 / 加列（向后兼容）→ 直接回滚代码即可；
  - 删列 / 改类型 → 需要先写反向迁移，或走 PITR。
- **短信**：如果新版本短信异常，可临时把手动开关关掉（无），应直接回滚代码，不要切回 mock —— 生产环境会拒绝启动。

---

## 6. 尚未验证的项（上线前需人工确认）

| 项 | 状态 | 说明 |
|---|---|---|
| 真实 Neon 连接 | 未验证 | 本地用 PGlite 验证；Neon pooled/direct 串、SSL、连接数需实测 |
| 真实短信下发 | 未验证 | 代码已实现腾讯云 SendSms，需要资质与模板；建议先发一条测试短信 |
| 备份恢复 | 未演练 | 步骤见 5.2 |
| Cloudflare Workers | 未验证 | `cf:*` 脚本保留，未实际部署 |
| 多实例限流 | 部分 | 隐私锁定与手机号冷却已落库；Better Auth 的按 IP 限流仍是进程内存储 |

---

## 7. 已知限制（上线前知情）

- 隐私密码全局共享，不是每人一个；忘记只能在服务端重置。
- 短信按 IP 的限流依赖 Better Auth 内存存储，多实例部署下按实例计算；同一手机号的 60 秒冷却已落库。
- 联系人列表最多扫描 2000 位后在内存排序分页；超出时接口返回 `truncated: true`。
- 对账单次最多返回 500 条，超出时 `truncated: true`。
- 账本管理员不能直接退出，必须先转让；账本本身不能删除。
- 没有操作审计日志，成员增删改无法追溯到人。
