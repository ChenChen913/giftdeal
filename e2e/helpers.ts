import { expect, type Page } from "@playwright/test";

/**
 * 每个用例用一个新的手机号注册：数据天然隔离，互不干扰。
 * 固定验证码由 APP_ENV=test + OTP_ALLOW_FIXED_CODE=true 提供。
 */
let sequence = 0;

export function uniquePhone(): string {
  sequence += 1;
  const tail = String(sequence).padStart(4, "0");
  const stamp = String(Date.now() % 10000).padStart(4, "0");
  return `138${stamp}${tail}`;
}

export const FIXED_CODE = "123456";
export const PRIVACY_PASSWORD = "331633";

/** 完整走一遍登录 UI：手机号 → 获取验证码 → 固定码 → 同意协议 → 登录 */
export async function submitLogin(
  page: Page,
  phone = uniquePhone(),
  next?: string,
): Promise<string> {
  const target = next ? `/login?next=${encodeURIComponent(next)}` : "/login";
  await page.goto(target);
  await page.getByPlaceholder("13812348821").fill(phone);
  await page.getByRole("button", { name: "获取验证码" }).click();
  await expect(page.getByText(/验证码已发出/)).toBeVisible();
  await page.getByPlaceholder("••••••").fill(FIXED_CODE);
  await page.locator("#agree-legal").check();
  await page.getByRole("button", { name: /立即登录/ }).click();
  return phone;
}

/** 登录并确认进入了应用外壳（默认落在首页看板） */
export async function login(page: Page, phone = uniquePhone()): Promise<string> {
  const used = await submitLogin(page, phone);
  // 桌面有侧栏、移动端只有底栏，用「首页标题 + URL」判断登录完成，两种布局都成立
  await expect(page).toHaveURL(/\/$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "我的礼金账本" })).toBeVisible({
    timeout: 20_000,
  });
  return used;
}

/** 通过接口解锁隐私模式，省去每个用例重复点弹窗（密码流程由 privacy 用例专门覆盖） */
export async function unlockPrivacy(page: Page): Promise<void> {
  const response = await page.request.post("/api/v1/privacy/verify", {
    data: { password: PRIVACY_PASSWORD },
  });
  expect(response.ok()).toBeTruthy();
}

export async function createContact(page: Page, name: string): Promise<void> {
  await page.goto("/contacts");
  await page.getByRole("button", { name: "新增" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("新增亲友");
  await dialog.getByPlaceholder("如：王建国").fill(name);
  await dialog.getByRole("button", { name: "加入名单" }).click();
  await expect(page.locator(".toast").last()).toContainText("已加入亲友名单");
  await expect(dialog).toBeHidden();
}

type RecordOptions = {
  amount: number;
  contactName: string;
  direction?: "received" | "given";
  date?: string;
  note?: string;
  settleFirstPending?: boolean;
  asPlan?: boolean;
};

/** 打开「记一笔」弹窗并提交 */
export async function addRecord(page: Page, options: RecordOptions): Promise<void> {
  await page.getByRole("button", { name: "记一笔" }).first().click();
  const dialog = page.getByRole("dialog");

  if (options.direction === "given") {
    await dialog.getByRole("button", { name: "我送出的礼金" }).click();
  }

  await dialog.getByPlaceholder("0").fill(String(options.amount));

  const contactSelect = dialog.locator("select").first();
  await contactSelect.selectOption({ label: options.contactName });

  if (options.note) {
    await dialog.getByPlaceholder("如：小女周岁答谢宴").fill(options.note);
  }

  if (options.date) {
    await dialog.locator('input[type="date"]').fill(options.date);
  }

  if (options.settleFirstPending) {
    const settleSelect = dialog.locator("select").nth(1);
    await settleSelect.selectOption({ index: 1 });
  }

  if (options.asPlan) {
    // 分段控件和底部按钮同名，点底部提交按钮
    await dialog.locator(".modal-foot").getByRole("button", { name: "加入预备" }).click();
    await expect(page.locator(".toast").last()).toContainText("已加入人情预备");
    return;
  }

  await dialog.getByRole("button", { name: "确认入账" }).click();
}

/** 最新一条提示（提示会短暂堆叠，取最后一条避免 strict mode 冲突） */
export function toast(page: Page) {
  return page.locator(".toast").last();
}
