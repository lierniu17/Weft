import { expect, test } from "@playwright/test";
import {
  pinClock,
  registerUser,
  replayedOr,
  say,
  seedGraph,
  shot,
  threadOf,
  usage,
} from "./support/bot.ts";
import { LLM_WAIT } from "./support/env.ts";

const TEXT = "老张升职了，他现在在哪个部门？";

/**
 * Intent routing BOT-3 〔AC-5〕 new information and a question in one message: the draft card
 * first, then the answer — from the graph as it was, so without the unconfirmed 升职.
 */
test("INTENT BOT-3 既记录又提问", { tag: "@llm" }, async ({ page }) => {
  await pinClock(page);
  const user = await registerUser(page);
  seedGraph(user.username);
  await page.goto("/");
  const before = await usage(page);

  // 1. 输入“老张升职了，他现在在哪个部门？”并发送。
  await say(page, TEXT);
  const thread = threadOf(page, TEXT);
  const card = thread.getByRole("region", { name: "草稿" });
  const answer = thread.getByRole("article", { name: "回答" });
  await expect(answer).toBeVisible({ timeout: LLM_WAIT });
  await expect(card.getByRole("status")).toHaveText(/草稿/, { timeout: LLM_WAIT });
  // draft card first, then the answer
  const cardBox = await card.boundingBox();
  const answerBox = await answer.boundingBox();
  expect(cardBox !== null && answerBox !== null && cardBox.y < answerBox.y).toBe(true);
  await expect(answer).toContainText(replayedOr<string | RegExp>("字节跳动", /./));
  await expect(answer).not.toContainText("升职");
  // both were done: no 纠正 either way
  await expect(thread.getByRole("button", { name: /^改为/ })).toHaveCount(0);
  await expect(thread).toContainText("记录 · 今天 · 提问");
  expect(await usage(page)).toEqual({ entry: before.entry + 1, ask: before.ask + 1 });
  await shot(page, "INTENT-BOT-3-step1-both");
});
