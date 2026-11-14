# 04 · 部署检查清单（Vercel + Neon）

按顺序勾完即可上线。每一步都写了「怎么验」，不要凭感觉跳过。

---

## 1. 前置准备

- [ ] Neon 建库，拿到两条连接串：
  - **pooled**（主机名带 `-pooler`）→ `DATABASE_URL`
  - **direct**（不带 pooler）→ `DIRECT_URL`
- [ ] Vercel 导入仓库 `ChenChen913/giftdeal`，Framework 自动识别为 Next.js
- [ ] 确认 Node 版本 22（Project Settings → General → Node.js Version）
- [ ] 准备生产域名（Vercel 默认域名即可，自定义域名更好）

---

## 2. 环境变量

### 必填

| 变量 | 说明 |
|---|---|
| `DATABASE_URL` | Neon pooled 串，运行时用 |
| `DIRECT_URL` | Neon direct 串，迁移用 |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` 生成，**不能与本地相同** |
| `BETTER_AUTH_URL` | 生产域名，如 `https://giftdeal.vercel.app`，必须带 `https://` |
| `NEXT_PUBLIC_APP_URL` | 邀请链接的域名，通常与上一项相同 |
| `SMS_PROVIDER` | 短信通道名。当前代码只实现了 `mock`，接入真实通道后填新名字 |
| `PRIVACY_PASSWORD` | 隐私模式解锁密码，设一个强密码 |

### 生产环境必须关闭

| 变量 | 值 | 原因 |
|---|---|---|
| `OTP_ALLOW_FIXED_CODE` | 删除或 `false` | 否则任何人用 `123456` 就能登录 |
| `ALLOW_ADMIN_LOGIN` | 删除或 `false` | 否则 `admin` 账号通道整体开放 |
| `ALLOW_LAN_ACCESS` | 删除或 `false` | 只用于本地手机联调 |
| `NEXT_PUBLIC_SHOW_DEMO_HINT` | 删除或 `false` | 登录页会印出演示账号 |

> 若确实要保留内部账号，必须同时把 `ADMIN_LOGIN_PASSWORD` 改成强密码。
> 代码里的默认值 `123456` 只在本地开发有意义。

---

## 3. 构建与迁移

- [ ] Install Command：`npm ci`（`postinstall` 会自动 `prisma generate`）
- [ ] Build Command：`npm run build`
- [ ] **迁移不要放进 Build Command**。并发构建会重复执行，且失败会阻塞发布。
- [ ] 在本地或 CI 单独执行一次：

```bash
DIRECT_URL="<Neon direct 串>" npx prisma migrate deploy
```

- [ ] **不要在生产库执行 `prisma db seed`**。脚本已在 `NODE_ENV=production` 时默认拒绝，
      除非显式设置 `ALLOW_SEED=true`。

---

## 4. 上线后逐项验证

用真实手机和两个账号（A、B）走一遍：

- [ ] `GET /api/v1/health` 返回 `{"ok":true,"data":{"db":"up"}}`
- [ ] 打开首页 → 跳转登录页，页面无报错
- [ ] 输入 A 的手机号 → **能收到真实短信**（不是日志里的码）
- [ ] 输入验证码 → 进入首页，自动创建账本
- [ ] 新建亲友 → 记一笔收礼 → 首页「累计收到」增加
- [ ] 记一笔送礼并关联结清 → 待回礼减少 1 笔
- [ ] 生成邀请链接 → 用 B 的手机打开 → 接受后成为记账员
- [ ] B 登录后能看到 A 的账本与记录（共享生效）
- [ ] 用 B 的账号访问 A 的另一本账本 → 返回 404（数据隔离生效）
- [ ] 首页金额默认显示为 `¥*,***`，输入隐私密码后显示真实值
- [ ] 点「导出账本数据」→ 下载 JSON，字段完整
- [ ] 账本页对非管理员显示「退出」，对管理员显示「设为管理员」
- [ ] `curl -I https://<域名>/login` 能看到 `content-security-policy`、
      `x-frame-options`、`referrer-policy`

---

## 5. 回滚

- **代码**：Vercel → Deployments → 选中上一个正常版本 → Promote to Production
- **数据库**：Prisma 迁移没有自动回滚。回滚代码前先确认新迁移是否改变了表结构；
  Neon 支持按时间点恢复（PITR），在控制台操作。
- **建议**：每次上线前在 Neon 打一个手动快照或记下时间点。

---

## 6. 已知限制（上线前需要知情）

- 短信通道目前是 mock，真实用户收不到验证码 —— 必须先接短信服务。
- 隐私模式密码是全局共享的，不是每人一个；失败锁定在进程内，多实例下不严格。
- 没有审计日志，成员的所有增删改无法追溯是谁做的。
- 数据导出为 JSON，暂不支持 CSV 或按人导出。
- 账本管理员不能直接退出，必须先转让；账本本身不能删除。
