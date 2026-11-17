import { expect, test } from "@playwright/test";
import { nextInvite, PASSWORD, pinClock, shot, uniqueLogin } from "./support/bot.ts";

/** BOT-1 〔AC-1, AC-2, AC-3〕 register with an invite code, see 本人, log out and back in. */
test("BOT-1 注册、本人、退出与重新登录", async ({ page }) => {
  await pinClock(page);
  const username = uniqueLogin("bot1");

  // 1. 打开注册页，输入一个无效邀请码提交。
  await page.goto("/register");
  await page.getByLabel("邀请码", { exact: true }).fill("WEFT-NOPE");
  await page.getByLabel("账号", { exact: true }).fill(username);
  await page.getByLabel("密码", { exact: true }).fill(PASSWORD);
  await page.getByLabel("称呼", { exact: true }).fill("小明");
  await page.getByRole("button", { name: "注册" }).click();
  await expect(page.getByText("邀请码无效或已被使用")).toBeVisible();
  await shot(page, "BOT-1-step1-invalid-invite");

  // 2. 换成有效邀请码，填写账号、密码和称呼“小明”，提交。
  await page.getByLabel("邀请码", { exact: true }).fill(nextInvite());
  await page.getByRole("button", { name: "注册" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "随手记下和人有关的事" })).toBeVisible();

  // 3. 打开人物列表。
  await page
    .getByRole("navigation", { name: "主导航" })
    .getByRole("button", { name: "人物" })
    .click();
  await expect(page).toHaveURL(/\/people$/);
  const self = page.getByRole("list", { name: "本人" });
  await expect(self).toContainText("小明（我）");
  await expect(page.locator("[data-list-item]")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "还没有记录任何人" })).toBeVisible();
  await shot(page, "BOT-1-step3-people");

  // 4. 退出登录。
  await page
    .getByRole("navigation", { name: "主导航" })
    .getByRole("button", { name: "我的" })
    .click();
  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(page).toHaveURL(/\/login$/);

  // 5. 直接访问人物列表页面。
  await page.goto("/people");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "登录" })).toBeVisible();
  expect((await page.request.get("/api/persons")).status()).toBe(401);

  // 6. 用正确的账号密码重新登录。
  await page.getByLabel("账号", { exact: true }).fill(username);
  await page.getByLabel("密码", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/people$/);
  await expect(page.getByRole("list", { name: "本人" })).toContainText("小明（我）");
});
