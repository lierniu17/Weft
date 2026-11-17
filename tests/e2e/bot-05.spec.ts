import { expect, test } from "@playwright/test";
import { ask, pinClock, registerUser, seedGraph, shot } from "./support/bot.ts";

/** BOT-5 〔AC-28, AC-36, AC-37〕 ask over the seed graph; citations; the relationship page. */
test("BOT-5 问答、出处与第三方关系页", async ({ page }) => {
  await pinClock(page);
  const user = await registerUser(page);
  seedGraph(user.username);
  await page.goto("/");

  // 1. 问“老张和小李是什么关系？”
  await ask(page, "老张和小李是什么关系？");
  const answers = page.getByRole("article", { name: "回答" });
  const first = answers.nth(0);
  await expect(first).toContainText("大学室友", { timeout: 60_000 });
  await expect(first).toContainText("借钱");
  await expect(first).toContainText("据小王说");
  // 提问发送后自动切回记录
  await expect(page.getByRole("radio", { name: "记录" })).toBeChecked();
  await first.scrollIntoViewIfNeeded();
  await shot(page, "BOT-5-step1-answer");

  // 2. 点开回答里的一个出处。
  await first.locator("[data-citation-mark]").last().click();
  const citation = page.getByRole("dialog", { name: /出处/ });
  await expect(citation).toContainText("听小王说，老张和小李以前是大学室友");
  await expect(citation.getByRole("img", { name: /可信度：转述/ })).toBeVisible();
  await page.keyboard.press("Escape");

  // 3. 问“我是怎么认识小王的？”
  await ask(page, "我是怎么认识小王的？");
  const second = answers.nth(1);
  const path = second.getByRole("list", { name: "人脉路径" });
  await expect(path).toBeVisible({ timeout: 60_000 });
  await expect(path.locator("[data-path-name]")).toHaveText(["我", "张伟", "王浩"]);
  await second.scrollIntoViewIfNeeded();
  await shot(page, "BOT-5-step3-answer");

  // 4. 问“谁喜欢露营？”
  await ask(page, "谁喜欢露营？");
  const third = answers.nth(2);
  const list = third.getByRole("list", { name: "人物列表" });
  await expect(list).toBeVisible({ timeout: 60_000 });
  for (const name of ["王浩", "陈静", "孙悦", "刘洋"]) await expect(list).toContainText(name);
  await third.scrollIntoViewIfNeeded();
  await shot(page, "BOT-5-step4-answer");

  // 5. 从第 1 步回答里点击进入老张与小李的关系页。
  await first.scrollIntoViewIfNeeded();
  await first.locator("[data-citation-mark]").first().click();
  await citation.getByRole("button", { name: /查看.*的关系/ }).click();
  await expect(page).toHaveURL(/\/relationships\//);
  const overview = page.locator("[data-relationship-overview]");
  await expect(overview).toContainText("社会 · 室友");
  await expect(overview.getByText("紧张")).toBeVisible();
  await expect(overview.getByRole("img", { name: "可信度：转述" })).toBeVisible();
  await shot(page, "BOT-5-step5-relationship");
});
