import { expect, test } from "@playwright/test";
import { draftCardOf, lastMonth, pinClock, registerUser, shot, threadOf } from "./support/bot.ts";
import { answerZhouNews, clarifyOf, ZHOU_NEWS, ZHOU_NEWS_ANSWER } from "./support/clarify.ts";
import { LLM_WAIT } from "./support/env.ts";

/**
 * Intent clarify BOT-4 〔AC-8〕 after a reload everything comes back from the message list:
 * the 反问 (resolved, so without options) and the draft card under the typed answer.
 */
test("CLARIFY BOT-4 刷新后反问与处理结果还原", { tag: "@llm" }, async ({ page }) => {
  await pinClock(page);
  await registerUser(page);
  await page.goto("/");
  // 前置：完成 BOT-2 的操作。
  const done = await answerZhouNews(page);
  const question = (await done.asked.reply.locator("p").first().textContent()) ?? "";
  expect(question).not.toBe("");

  // 1. 刷新页面。
  await page.reload();
  const original = threadOf(page, ZHOU_NEWS);
  const asked = clarifyOf(original);
  await expect(asked.reply).toContainText(question, { timeout: LLM_WAIT });
  await expect(asked.options).toHaveCount(0);
  await expect(original.getByRole("button")).toHaveCount(0);
  await expect(original.locator("[data-draft-card]")).toHaveCount(0);
  const card = draftCardOf(page, ZHOU_NEWS_ANSWER);
  await expect(card.getByRole("status")).toHaveText(/草稿/);
  await expect(card).toContainText("老周");
  const { y, m } = lastMonth();
  const answer = threadOf(page, ZHOU_NEWS_ANSWER);
  await expect(answer).toContainText(`记录 · ${y} 年 ${m} 月`);
  // 已处理的消息照常显示纠正（intent routing AC-10）
  await expect(answer.getByRole("button", { name: "改为提问" })).toBeVisible();
  await card.scrollIntoViewIfNeeded();
  await shot(page, "CLARIFY-BOT-4-step1-restored");
});
