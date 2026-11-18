import { expect, test } from "@playwright/test";
import { draftCardOf, pinClock, registerUser, say, shot, threadOf, usage } from "./support/bot.ts";
import { LLM_WAIT } from "./support/env.ts";

const TEXT = "老张喜欢什么";

/**
 * Intent routing BOT-6 〔AC-10〕 改为提问: the unconfirmed draft is discarded, then the
 * question is answered; the message no longer offers 改为提问.
 */
test("INTENT BOT-6 判错后改为提问", { tag: "@llm" }, async ({ page }) => {
  await pinClock(page);
  await registerUser(page);
  await page.goto("/");

  // 1. 发送“老张喜欢什么”（回放识别为记录）。
  await say(page, TEXT);
  const thread = threadOf(page, TEXT);
  const card = draftCardOf(page, TEXT);
  await expect(card.getByRole("status")).toHaveText(/草稿/, { timeout: LLM_WAIT });
  const toAsk = thread.getByRole("button", { name: "改为提问" });
  await expect(toAsk).toBeVisible();

  // 2. 点“改为提问”。
  await toAsk.click();
  const answer = thread.getByRole("article", { name: "回答" });
  await expect(answer).toContainText("图谱里没有相关信息", { timeout: LLM_WAIT });
  await expect(card.getByRole("status")).toHaveText("已放弃");
  await expect(thread.getByRole("button", { name: "改为提问" })).toHaveCount(0);
  await expect(thread.getByRole("button", { name: "改为记录" })).toBeVisible();
  // 按新类型计数，不退还已扣的录入额度
  expect(await usage(page)).toEqual({ entry: 1, ask: 1 });
  await answer.scrollIntoViewIfNeeded();
  await shot(page, "INTENT-BOT-6-step2-asked");
});
