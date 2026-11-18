import { expect, test, type Page } from "@playwright/test";

import { createContact, login, submitLogin, toast, unlockPrivacy } from "./helpers";

type MeResponse = {
  data: {
    ledgers: { id: string; name: string; role: string }[];
    defaultLedgerId: string;
  };
};

async function me(page: Page): Promise<MeResponse["data"]> {
  const response = await page.request.get("/api/v1/me");
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as MeResponse;
  return body.data;
}

test("家庭邀请：生成链接 → 新成员接受 → 能看到同一账本的数据", async ({ page, browser }) => {
  await login(page);
  await unlockPrivacy(page);
  await createContact(page, "共享亲友");
  const owner = await me(page);
  const ledgerId = owner.ledgers[0].id;

  await page.goto("/ledger");
  await page.getByRole("button", { name: "生成邀请链接" }).click();

  const linkText = page.getByText(/\/invite\/[0-9a-f]{32}/);
  await expect(linkText).toBeVisible();
  const match = (await linkText.innerText()).match(/\/invite\/([0-9a-f]{32})/);
  expect(match).not.toBeNull();
  const token = match![1];

  // 另开一个浏览器上下文：相当于家人的手机
  const guestContext = await browser.newContext();
  const guestPage = await guestContext.newPage();
  await submitLogin(guestPage, undefined, `/invite/${token}`);

  await expect(guestPage.getByRole("button", { name: /接受邀请/ })).toBeVisible();
  await guestPage.getByRole("button", { name: /接受邀请/ }).click();
  await expect(toast(guestPage)).toContainText("已加入账本");

  const guest = await me(guestPage);
  expect(guest.ledgers.some((item) => item.id === ledgerId && item.role === "MEMBER")).toBe(true);

  // 通过共享账本上下文能读到对方的亲友
  const contacts = await guestPage.request.get(`/api/v1/contacts?pageSize=50`, {
    headers: { "X-Ledger-Id": ledgerId },
  });
  expect(contacts.status()).toBe(200);
  const body = (await contacts.json()) as { data: { items: { name: string }[] } };
  expect(body.data.items.some((item) => item.name === "共享亲友")).toBe(true);

  await guestContext.close();
});

test("数据隔离：非成员拿不到别人账本的数据", async ({ page, browser }) => {
  await login(page);
  await unlockPrivacy(page);
  await createContact(page, "私密亲友");
  const owner = await me(page);
  const ledgerId = owner.ledgers[0].id;

  const outsiderContext = await browser.newContext();
  const outsiderPage = await outsiderContext.newPage();
  await login(outsiderPage);

  const response = await outsiderPage.request.get("/api/v1/contacts?pageSize=50", {
    headers: { "X-Ledger-Id": ledgerId },
  });
  expect(response.status()).toBe(403);
  const body = (await response.json()) as { error?: { code?: string } };
  expect(body.error?.code).toBe("LEDGER_FORBIDDEN");

  // 换成本人账本则正常
  const own = await me(outsiderPage);
  const ok = await outsiderPage.request.get("/api/v1/contacts?pageSize=50", {
    headers: { "X-Ledger-Id": own.ledgers[0].id },
  });
  expect(ok.status()).toBe(200);

  await outsiderContext.close();
});
