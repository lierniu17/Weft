import { expect, test } from "@playwright/test";
import { PASSWORD, pinClock, recordConfirmed, registerUser, shot } from "./support/bot.ts";

/** BOT-11 〔AC-5〕 delete the account with the password; it can no longer log in. */
test("BOT-11 注销账户", async ({ page }) => {
  await pinClock(page);
  const user = await registerUser(page);
  // 前置：一个已有若干人物和记录的账户。
  await recordConfirmed(page, "老张是个急性子。");
  await recordConfirmed(page, "张伟是我的同事。");

  // 1. 进入设置，选择注销账户，按提示输入密码确认。
  await page.goto("/me");
  await page.getByRole("button", { name: /注销账户/ }).click();
  const form = page.getByRole("form", { name: "注销账户" });
  await form.getByLabel("输入密码确认", { exact: true }).fill(PASSWORD);
  await shot(page, "BOT-11-step1-confirm");
  await form.getByRole("button", { name: "注销" }).click();
  await expect(page).toHaveURL(/\/login$/);

  // 2. 用原账号密码登录。
  await page.getByLabel("账号", { exact: true }).fill(user.username);
  await page.getByLabel("密码", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByText("账号或密码错误")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});
