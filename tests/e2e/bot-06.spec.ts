import { expect, test } from "@playwright/test";
import { personId, pinClock, recordConfirmed, registerUser, shot } from "./support/bot.ts";

/** BOT-6 〔AC-26〕 edit the profile in place; the change cites a 手动编辑记录. */
test("BOT-6 就地编辑画像与手动编辑记录", async ({ page }) => {
  await pinClock(page);
  await registerUser(page);
  // 前置：老张的画像里有性格标签“急性子”，没有生日。
  await recordConfirmed(page, "老张是个急性子。");
  const laozhang = await personId(page, "老张");
  await page.goto(`/people/${laozhang}`);
  await expect(page.locator('[data-profile-section="tags"]').first()).toContainText("急性子");

  // 1. 在老张的画像页把生日设为 3 月 5 日。
  await page.getByRole("button", { name: "编辑" }).click();
  await page.getByLabel("生日", { exact: true }).fill("3 月 5 日");
  // 2. 删除性格标签“急性子”。
  await page.getByRole("button", { name: "移除 急性子" }).click();
  await page.getByRole("button", { name: "完成" }).click();
  const identity = page.locator('[data-profile-section="notes"]').filter({ hasText: "基本身份" });
  await expect(identity).toContainText("生日 · 3 月 5 日");
  await expect(
    page.locator('[data-profile-section="tags"]').filter({ hasText: "性格" }),
  ).not.toContainText("急性子");

  // 3. 点开生日这一条的出处。
  await identity.getByRole("button", { name: /生日/ }).click();
  const citation = page.getByRole("dialog", { name: /出处/ });
  await expect(citation).toContainText("手动编辑");
  await expect(citation.getByRole("img", { name: "可信度：亲历" })).toBeVisible();
  await shot(page, "BOT-6-step3-citation");
  await page.keyboard.press("Escape");

  // 4. 打开记录列表。
  await page.goto("/entries");
  await expect(page.locator("button").filter({ hasText: "手动编辑" })).toHaveCount(2);
});
