# 05 · 接入腾讯云短信（验证码）

从 mock 切到真实短信的完整流程。照着做，大约 1 小时（不含审核等待）。

代码侧已经写好（`src/server/otp/tencent.ts`），你只需要在腾讯云拿到 5 个值填进环境变量。

---

## 0. 先确认你手上有这些

- [ ] 一个已实名认证的腾讯云账号（没有就注册，个人认证即可，微信扫脸 10 分钟）
- [ ] **公众号或小程序**（用于签名资质审核）——你有，这步没问题
- [ ] 50 元左右预算（1000 条套餐）
- [ ] 能接收短信的手机号，用于测试

---

## 1. 注册并实名认证

1. 打开 <https://cloud.tencent.com>，右上角「注册」
2. 登录后点右上角头像 →「账号信息」→「实名认证」
3. 选「个人认证」，用微信扫码 + 身份证，约 10 分钟通过

> 没实名的账号无法开通短信服务。

---

## 2. 开通短信服务

1. 控制台搜索「短信」，进入 **短信控制台**（<https://console.cloud.tencent.com/smsv2>）
2. 首次进入会提示开通服务，点「开始使用」
3. 同意服务协议

开通本身免费，按发送量计费。

---

## 3. 创建应用，拿 SDK AppID

1. 左侧「应用管理」→「应用列表」→「创建应用」
2. 应用名称填 `礼金账本`，应用简介随意
3. 创建完成后，列表里会出现一个 **SDK AppID**，形如 `1400xxxxxx`

**记下这个值** → 后面填 `TENCENT_SMS_SDK_APP_ID`。

---

## 4. 申请签名（关键步骤，1–2 个工作日）

签名就是短信开头那个【】里的名字，比如【礼金账本】。

1. 左侧「国内短信」→「签名管理」→「创建签名」
2. 填写：
   - **签名内容**：`礼金账本`（2–12 个字，不能是纯数字/纯英文，不能含「短信」「验证码」等通用词）
   - **签名用途**：自用
   - **适用场景**：验证码
   - **资质证明**：上传下面任意一项
3. 上传资质（用你的公众号或小程序）：

| 你有 | 去哪里截图 |
|---|---|
| 公众号 | 公众号后台 → 设置与开发 → 公众号设置 → 账号详情（要能看到公众号名称和主体） |
| 小程序 | 小程序后台 → 设置 → 基本设置 → 账号信息（要能看到小程序名称和主体） |

4. 提交后等审核，通常 **1–2 个工作日**。审核通过后状态变为「已通过」。

**记下签名内容** → 后面填 `TENCENT_SMS_SIGN_NAME`。

> 如果被驳回，最常见原因是截图里看不到主体信息，或者签名名称与资质主体明显无关。
> 补充一张「签名使用说明」截图（比如小程序里出现该名称的页面）通常能过。

---

## 5. 申请正文模板（几分钟到几小时）

1. 左侧「国内短信」→「正文模板管理」→「创建正文模板」
2. 填写：
   - **模板名称**：`登录验证码`
   - **模板类型**：验证码
   - **模板内容**：

```
您的验证码为{1}，5分钟内有效，请勿泄露。
```

> `{1}` 是变量占位符，代码里会传验证码进去。不要写成 `{code}` 或 `{{1}}`。

3. 提交审核，验证码类模板通常很快通过。

**记下模板 ID**（一串数字，不是模板名称）→ 后面填 `TENCENT_SMS_TEMPLATE_ID`。

---

## 6. 创建 API 密钥

1. 控制台搜索「访问管理」→「API 密钥管理」（<https://console.cloud.tencent.com/cam/capi>）
2. 「新建密钥」，会得到 **SecretId** 和 **SecretKey**
3. **SecretKey 只显示一次**，立刻复制保存

**记下这两个值** → `TENCENT_SMS_SECRET_ID` / `TENCENT_SMS_SECRET_KEY`。

> 建议做法（可选）：不要用主账号密钥。在「访问管理 → 用户 → 新建用户」建一个子用户，
> 只授予 `QcloudSMSFullAccess` 策略，用子用户的密钥。这样即使泄露，影响也限于短信服务。

---

## 7. 填环境变量

打开项目根目录的 `.env`（没有就从 `.env.example` 复制），改成：

```dotenv
SMS_PROVIDER="tencent"

TENCENT_SMS_SECRET_ID="你的 SecretId"
TENCENT_SMS_SECRET_KEY="你的 SecretKey"
TENCENT_SMS_SDK_APP_ID="1400xxxxxx"
TENCENT_SMS_SIGN_NAME="礼金账本"
TENCENT_SMS_TEMPLATE_ID="1234567"
TENCENT_SMS_REGION="ap-guangzhou"
```

同时把固定验证码关掉（切到 tencent 后它本来就不生效，但建议显式删除，避免以后切回 mock 时忘记）：

```dotenv
# 删掉这一行，或设为 false
OTP_ALLOW_FIXED_CODE="false"
```

> 缺任何一个变量，应用启动时会直接报错并列出缺哪些，不会等到用户点「获取验证码」才暴露。

---

## 8. 本地联调

1. 重启开发服务：

```bash
npm run dev:local
```

2. 打开 <http://localhost:3000/login>
3. 输入**你自己的手机号**，点「获取验证码」
4. 手机应在几秒内收到短信；没收到就看终端日志，会打印 `[OTP] 发送失败 138****0001` 加具体错误码
5. 输入收到的验证码，能登录即成功

> 调试期间注意腾讯云默认频控：同一手机号 1 分钟 1 条、1 小时 5 条、24 小时 10 条。
> 频繁测试会被临时限流，等一会儿再试。

---

## 9. 上线

在 Vercel 的环境变量里加上同样 6 个变量（`SMS_PROVIDER` + 5 个 `TENCENT_SMS_*`），
并确认 **`OTP_ALLOW_FIXED_CODE` 不存在或为 false**。

改完重新部署，用真实手机走一遍登录流程。

---

## 10. 费用

| 项目 | 价格 |
|---|---|
| 国内短信（验证码） | 约 **0.045 元/条** |
| 1000 条套餐包 | 约 **45 元** |
| 新用户免费额度 | 常有 100 条试用 |

按家庭使用估算：一个月登录 10 次 = 0.45 元，1000 条能用很多年。

计费在「费用中心 → 账单」查看，可以设置余额告警。

---

## 11. 常见报错对照

| 错误码 | 原因 | 怎么修 |
|---|---|---|
| `AuthFailure.SignatureFailure` | SecretKey 填错，或系统时间偏差过大 | 重新复制密钥；确认服务器时间准确 |
| `FailedOperation.SignatureIncorrectOrUnapproved` | 签名未通过审核，或名字与申请的不一致 | 等审核通过；核对 `TENCENT_SMS_SIGN_NAME` 与签名内容完全一致（不要带【】） |
| `FailedOperation.TemplateIncorrectOrUnapproved` | 模板未通过，或模板 ID 填成了模板名称 | 核对 `TENCENT_SMS_TEMPLATE_ID` 是数字 ID |
| `InvalidParameterValue.IncorrectPhoneNumber` | 号码不是 E.164 格式 | 本项目只接受 `+86` + 11 位手机号，检查是否少了 `+86` |
| `LimitExceeded.PhoneNumberDailyLimit` | 同一号码当天超 10 条 | 等次日，或控制台调整频控 |
| `FailedOperation.InsufficientBalanceInSmsPackage` | 套餐余量不足 | 充值或买套餐包 |
| `UnauthorizedOperation` | 子账号没有短信权限 | 给子账号加 `QcloudSMSFullAccess` 策略 |

---

## 12. 代码在哪

| 文件 | 作用 |
|---|---|
| `src/server/otp/index.ts` | 通道选择：`SMS_PROVIDER=mock / tencent` |
| `src/server/otp/tencent.ts` | 腾讯云 SendSms 调用 + TC3 签名（零依赖，手写签名） |
| `src/server/auth.ts` | Better Auth 的 `sendOTP` 钩子，调用上面的 provider |

要换别的服务商（阿里云、第三方平台），只需新增一个实现 `OtpProvider` 接口的类，
在 `createOtpProvider` 里加一个分支，业务代码不用动。
