import { expect, test } from "@playwright/test";

import { FIXED_CODE, PRIVACY_PASSWORD, createContact, login, unlockPrivacy } from "./helpers";

test("登录：新手机号首次验证即开通默认账本", async ({ page }) => {
  const phone = await login(page);

  await expect(page.getByRole("heading", { name: "我的礼金账本" })).toBeVisible();
  await expect(page.getByText("主家庭账簿")).toBeVisible();
  // 新账本：待回礼 0、记录 0
  await expect(page.getByText("¥*").first()).toBeVisible();
  expect(phone).toHaveLength(11);
});

test("隐私模式：密码错误有提示，正确后显示真实数据，可再次隐藏", async ({ page }) => {
  await login(page);
  await createContact(page, "张建国");

  const toggle = page.locator(".privacy-toggle:not(.compact)");
  await expect(toggle).toContainText("隐私模式");
  // 遮罩状态：金额数字全部变成星号，人名只留姓氏
  await expect(page.getByText("¥0").first()).toHaveCount(0);

  await toggle.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("输入隐私密码");

  await dialog.getByPlaceholder("请输入隐私密码").fill("000000");
  await dialog.getByRole("button", { name: "解锁" }).click();
  await expect(dialog.getByText(/隐私密码不正确/)).toBeVisible();

  await dialog.getByPlaceholder("请输入隐私密码").fill(PRIVACY_PASSWORD);
  await dialog.getByRole("button", { name: "解锁" }).click();

  await expect(toggle).toContainText("真实数据已显示");
  await expect(page.getByText("¥0").first()).toBeVisible();

  // 点一下立刻重新隐藏
  await toggle.click();
  await expect(toggle).toContainText("隐私模式");
});

test("固定验证码只在开发/测试环境可用：错误验证码不能登录", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("13812348821").fill("13866667777");
  await page.getByRole("button", { name: "获取验证码" }).click();
  await expect(page.getByText(/验证码已发出/)).toBeVisible();

  await page.getByPlaceholder("••••••").fill("000000");
  await page.locator("#agree-legal").check();
  await page.getByRole("button", { name: /立即登录/ }).click();

  await expect(page.getByText(/验证码|不正确/).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "首页看板" })).toHaveCount(0);
});

test("移动端：底部导航可以在主要页面之间切换", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  const bottomNav = page.locator(".bottomnav");
  await expect(bottomNav).toBeVisible();
  await bottomNav.getByRole("link", { name: "对账" }).click();
  await expect(page).toHaveURL(/\/contacts$/);
  await expect(page.getByRole("heading", { name: "人情对账" })).toBeVisible();

  await bottomNav.getByRole("link", { name: "待回礼" }).click();
  await expect(page).toHaveURL(/\/pending$/);

  // 记一笔的悬浮按钮在移动端仍然可用
  await page.getByRole("button", { name: "记一笔" }).click();
  await expect(page.getByRole("dialog")).toContainText("记一笔往来");
});

test("未登录访问受保护页面会回到登录页，并在登录后回到原页面", async ({ page }) => {
  await page.goto("/pending");
  await expect(page).toHaveURL(/\/login/);

  const phone = "13866668888";
  await page.getByPlaceholder("13812348821").fill(phone);
  await page.getByRole("button", { name: "获取验证码" }).click();
  await expect(page.getByText(/验证码已发出/)).toBeVisible();
  await page.getByPlaceholder("••••••").fill(FIXED_CODE);
  await page.locator("#agree-legal").check();
  await page.getByRole("button", { name: /立即登录/ }).click();

  await expect(page).toHaveURL(/\/pending$/);
  await unlockPrivacy(page);
});
