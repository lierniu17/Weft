/** Helpers for the intent clarify (反问澄清) BOTs. */
import { expect, type Locator, type Page } from "@playwright/test";
import { draftCardOf, lastMonth, say, threadOf } from "./bot.ts";
import { LLM_WAIT } from "./env.ts";

/** The fixed line of a 拿不准 message without a 反问. */
export const UNCERTAIN = "我没确定你是想记下来还是查询";

/** The 反问 under a message: its question and its options (the group is gone once resolved). */
export function clarifyOf(thread: Locator) {
  const reply = thread.locator("[data-clarify-reply]");
  return { reply, options: reply.getByRole("group", { name: "选一个，或直接回答" }) };
}

export const ZHOU_NEWS = "老周那事后来咋样了";
export const ZHOU_NEWS_ANSWER = "想记一下，他上个月被裁了";

/**
 * Clarify BOT-2's steps (BOT-4 starts from them): 「老周那事后来咋样了」 is asked back, then
 * the typed answer becomes a 记录 of 老周 being laid off last month, under the answer.
 */
export async function answerZhouNews(page: Page) {
  // 1. 发送“老周那事后来咋样了”（拿不准，反问）。
  await say(page, ZHOU_NEWS);
  const original = threadOf(page, ZHOU_NEWS);
  const asked = clarifyOf(original);
  await expect(asked.reply).toBeVisible({ timeout: LLM_WAIT });
  await expect(asked.reply).not.toContainText(UNCERTAIN);
  await expect(asked.options.getByRole("button").first()).toBeVisible();
  await expect(original.locator("[data-draft-card]")).toHaveCount(0);

  // 2. 输入“想记一下，他上个月被裁了”并发送。
  await say(page, ZHOU_NEWS_ANSWER);
  const answer = threadOf(page, ZHOU_NEWS_ANSWER);
  const card = draftCardOf(page, ZHOU_NEWS_ANSWER);
  await expect(card.getByRole("status")).toHaveText(/草稿/, { timeout: LLM_WAIT });
  await expect(card).toContainText("老周");
  await expect(card).toContainText("裁");
  const { y, m } = lastMonth();
  await expect(answer).toContainText(`记录 · ${y} 年 ${m} 月`);
  return { original, asked, answer, card };
}
