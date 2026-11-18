import { expect, test } from "@playwright/test";

import { addRecord, createContact, login, toast, unlockPrivacy } from "./helpers";

test("新增亲友 → 记一笔收礼 → 对账页看到双向流水与净差额", async ({ page }) => {
  await login(page);
  await unlockPrivacy(page);

  await createContact(page, "张建国");
  await addRecord(page, { amount: 600, contactName: "张建国", note: "婚礼随礼" });
  await expect(toast(page)).toContainText("已记入收礼");

  await page.goto("/contacts");
  await page.getByRole("link", { name: "张建国" }).click();
  await expect(page.getByText("双向人情净差额")).toBeVisible();
  await expect(page.getByText("+¥600").first()).toBeVisible();
  await expect(page.getByText("已结清")).toHaveCount(0);
  await expect(page.getByText("婚礼随礼")).toBeVisible();
});

test("关联结清：送出一笔并结清后，待回礼清单清空", async ({ page }) => {
  await login(page);
  await unlockPrivacy(page);
  await createContact(page, "李芳");

  await addRecord(page, { amount: 800, contactName: "李芳" });
  await expect(toast(page)).toContainText("已记入收礼");

  await page.goto("/pending");
  await expect(page.getByText("李芳")).toBeVisible();

  await addRecord(page, {
    amount: 800,
    contactName: "李芳",
    direction: "given",
    settleFirstPending: true,
  });
  await expect(toast(page)).toContainText("已记入送礼并结清");

  await page.goto("/pending");
  await expect(page.getByText("人情往来皆已结清")).toBeVisible();

  await page.goto("/contacts");
  await page.getByRole("link", { name: "李芳" }).click();
  await expect(page.getByText("已结清")).toBeVisible();
  // 待回礼标记消失，只剩「已结清」
  await expect(page.locator(".tl-top").getByText("待回礼", { exact: true })).toHaveCount(0);
});

test("人情预备：未来日期先入预备，标记完成时生成真实礼金", async ({ page }) => {
  await login(page);
  await unlockPrivacy(page);
  await createContact(page, "王强");

  await addRecord(page, {
    amount: 1200,
    contactName: "王强",
    date: "2030-05-01",
    note: "儿子婚宴",
    asPlan: true,
  });
  await expect(toast(page)).toContainText("已加入人情预备");

  await page.goto("/plans");
  await expect(page.getByText("王强")).toBeVisible();
  await expect(page.getByText("预计礼金")).toBeVisible();

  await page.getByRole("button", { name: "标记完成" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("完成这笔预备");
  await dialog.getByRole("button", { name: "确认完成" }).click();
  await expect(toast(page)).toContainText("已完成并记入账簿");

  await page.getByRole("button", { name: "已完成" }).click();
  await expect(page.getByText("已完成", { exact: true }).first()).toBeVisible();

  // 真实礼金已经入账
  await page.goto("/contacts");
  await page.getByRole("link", { name: "王强" }).click();
  await expect(page.getByText("+¥1,200").first()).toBeVisible();
});

test("删除礼金记录：列表与统计同步更新", async ({ page }) => {
  await login(page);
  await unlockPrivacy(page);
  await createContact(page, "赵敏");
  await addRecord(page, { amount: 500, contactName: "赵敏" });
  await expect(toast(page)).toContainText("已记入收礼");

  await page.goto("/contacts");
  await page.getByRole("link", { name: "赵敏" }).click();
  await expect(page.getByText("+¥500").first()).toBeVisible();

  await page.getByTitle("删除这笔礼金").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("删除这笔礼金");
  await dialog.getByRole("button", { name: "确认删除" }).click();
  await expect(toast(page)).toContainText("这笔礼金已删除");
  await expect(page.getByText("还没有往来记录")).toBeVisible();

  await page.goto("/");
  await expect(page.getByText("¥0").first()).toBeVisible();
});
