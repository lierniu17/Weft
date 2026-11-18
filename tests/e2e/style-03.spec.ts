import { expect, test } from "@playwright/test";
import { personId, pinClock, registerUser, seedGraph, shot } from "./support/bot.ts";

/** Internal names such as RELATED_EVENT / WORKS_AT. */
const INTERNAL_NAME = /\b[A-Z]+_[A-Z_]+\b/;

/**
 * Style refresh BOT-3 〔AC-9〕 the person page: at most two header tags, empty sections folded
 * into one 「还可以补充：……」 line, no internal field name; 生日 there opens in-place editing.
 */
test("STYLE BOT-3 人物页头部精简与还可以补充", async ({ page }) => {
  await pinClock(page);
  const user = await registerUser(page);
  // 前置：种子数据。张伟（老张）有社会角色、性格、我的评价，还有一件和小李之间的事
  // (RELATED_EVENT)，但没有生日、籍贯。
  seedGraph(user.username);
  const zhang = await personId(page, "张伟");

  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
    // 1. 打开该人物页。
    await page.goto(`/people/${zhang}`);
    const header = page.locator("[data-person-header]");
    await expect(header.getByRole("heading", { level: 1, name: "张伟" })).toBeVisible();
    await expect(header.locator("[data-person-relation]")).toContainText("老张");
    expect(await header.locator("[data-person-tags] > *").count()).toBeLessThanOrEqual(2);
    // empty sections are not listed one by one
    await expect(page.getByText("还没有记录", { exact: true })).toHaveCount(0);
    const fold = page.locator("[data-profile-fold]");
    await expect(fold).toContainText(/^还可以补充：生日、/);
    await expect(fold).toContainText("籍贯");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("main")).not.toContainText(INTERNAL_NAME);
    await shot(page, `STYLE-BOT-3-step1-person-${width}`);
  }

  // 2. 点“还可以补充”中的“生日”：进入生日的就地编辑。
  await page.locator("[data-profile-fold]").getByRole("button", { name: "生日" }).click();
  const birthday = page.getByRole("textbox", { name: "生日" });
  await expect(birthday).toBeVisible();
  await expect(birthday).toBeFocused();
  await expect(page.getByRole("button", { name: "完成" })).toBeVisible();
  await expect(page.locator("[data-profile-fold]")).toHaveCount(0);
});
