import { expect, test } from "@playwright/test";

import { login } from "./helpers";

/**
 * 手机端专属回归：侧栏在 <=860px 被隐藏，所有页面入口必须能从底栏直达；
 * 亲友名录的 4 行分类默认收起，展开后每行保持单行横向滑动，不能换行堆叠。
 */
test("移动端：底部导航可直达人生大事", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  const bottomNav = page.locator(".bottomnav");
  const entry = bottomNav.getByRole("link", { name: "人生大事" });
  await expect(entry).toBeVisible();
  await entry.click();

  await expect(page).toHaveURL(/\/events$/);
  await expect(page.getByRole("heading", { name: "人生大事" })).toBeVisible();
});

test("移动端：亲友分类默认收起，展开后仍可筛选并再次收起", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto("/contacts");
  await expect(page.getByRole("heading", { name: "人情对账" })).toBeVisible();

  const toggle = page.locator(".filter-toggle");
  const rows = page.locator(".filter-rows");
  await expect(toggle).toBeVisible();
  await expect(toggle).toContainText("全部亲友");
  await expect(rows).toBeHidden();

  await toggle.click();
  await expect(rows).toBeVisible();
  // 4 行各占一行（约 30px），不再像之前那样换行成 90px 的密集墙
  const heights = await page
    .locator(".filter-row")
    .evaluateAll((elements) =>
      elements.map((element) => Math.round(element.getBoundingClientRect().height)),
    );
  expect(heights).toHaveLength(4);
  expect(Math.max(...heights)).toBeLessThanOrEqual(36);

  await page.locator(".filter-chip").filter({ hasText: "父系亲戚" }).first().click();
  await expect(toggle).toContainText("父系亲戚");

  await toggle.click();
  await expect(rows).toBeHidden();
  // 收起后仍能看到已选条件，不会「筛完就不知道筛了什么」
  await expect(toggle).toContainText("父系亲戚");
});

test("移动端：顶栏可切换账本，补齐桌面侧栏的账本切换能力", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  const trigger = page.locator(".mobile-ledger-trigger");
  const menu = page.locator(".mobile-ledger-menu");
  await expect(trigger).toBeVisible();
  await expect(trigger).toContainText("我的礼金账本");
  await expect(menu).toBeHidden();

  await trigger.click();
  await expect(menu).toBeVisible();
  await expect(menu).toContainText("我的礼金账本");
  await expect(menu.getByRole("link", { name: "管理账本与成员" })).toBeVisible();
  // 选中当前账本后菜单收起，切换动作可完成
  await menu.getByRole("button", { name: /我的礼金账本/ }).click();
  await expect(menu).toBeHidden();
});

test("移动端与桌面端：同一账号的人生大事统计一致", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto("/events");
  await expect(page.getByRole("heading", { name: "人生大事" })).toBeVisible();
  const mobileStats = await page.locator(".stat-value").allInnerTexts();
  expect(mobileStats.length).toBeGreaterThan(0);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "人生大事" })).toBeVisible();
  const desktopStats = await page.locator(".stat-value").allInnerTexts();

  // 同一个页面、同一个数据源：视口不同不应导致一边有数据一边为空
  expect(desktopStats).toEqual(mobileStats);
});
