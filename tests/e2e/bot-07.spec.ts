import { expect, test } from "@playwright/test";
import { personId, pinClock, recordConfirmed, registerUser, shot } from "./support/bot.ts";

/** BOT-7 〔AC-27〕 delete a person: impact count, Entries kept, others untouched, 本人 safe. */
test("BOT-7 删除人物", { tag: "@llm" }, async ({ page }) => {
  await pinClock(page);
  const me = await registerUser(page);
  // 前置：有 3 条记录提到老张，其中一条同时提到小李升职。
  await recordConfirmed(page, "老张是个急性子。");
  await recordConfirmed(page, "周末和老张去水库钓鱼。");
  const both = await recordConfirmed(page, "老张说小李升职了，他俩是同事。");
  const laozhang = await personId(page, "老张");
  const xiaoli = await personId(page, "小李");

  // 1. 在老张的人物页点删除。
  await page.goto(`/people/${laozhang}`);
  await page.getByRole("button", { name: "更多操作" }).click();
  await page.getByRole("menuitem", { name: "删除人物" }).click();
  const dialog = page.getByRole("alertdialog", { name: "删除老张？" });
  await expect(dialog).toContainText("有 3 条记录提到他，原文会保留");
  await shot(page, "BOT-7-step1-delete-prompt");

  // 2. 阅读提示后确认。
  await dialog.getByRole("button", { name: "删除" }).click();
  await expect(page).toHaveURL(/\/people$/);

  // 3. 查找“老张”。
  await page.getByLabel("搜索姓名或别名").fill("老张");
  await expect(page.getByText("没有找到「老张」")).toBeVisible();

  // 4. 打开那条同时提到小李的记录。
  await page.goto(`/entries/${both.entryId}`);
  await expect(page.getByText("老张说小李升职了，他俩是同事。")).toBeVisible();

  // 5. 打开小李的画像页。
  await page.goto(`/people/${xiaoli}`);
  await expect(
    page.locator('[data-profile-section="notes"]').filter({ hasText: "生活事件" }),
  ).toContainText("升职");

  // 6. 尝试在本人的人物页找到删除操作。
  await page.goto(`/people/${me.self_person_id}`);
  await expect(page.getByRole("heading", { name: "小明", level: 2 })).toBeVisible();
  await expect(page.getByRole("button", { name: "更多操作" })).toHaveCount(0);
  await expect(page.getByText("删除人物")).toHaveCount(0);
});
