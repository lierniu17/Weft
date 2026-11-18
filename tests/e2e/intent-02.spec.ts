import { expect, test } from "@playwright/test";
import { pinClock, registerUser, say, seedGraph, shot, threadOf, usage } from "./support/bot.ts";
import { LLM_WAIT } from "./support/env.ts";

const QUESTION = "我是怎么认识小王的？";

/** Intent routing BOT-2 〔AC-4〕 a question is answered directly, with citations; no draft. */
test("INTENT BOT-2 直接提问得到带出处的回答", { tag: "@llm" }, async ({ page }) => {
  await pinClock(page);
  const user = await registerUser(page);
  seedGraph(user.username);
  await page.goto("/");
  const before = await usage(page);

  // 1. 输入“我是怎么认识小王的？”并发送。
  await say(page, QUESTION);
  const thread = threadOf(page, QUESTION);
  const answer = thread.getByRole("article", { name: "回答" });
  await expect(answer.getByRole("list", { name: "人脉路径" })).toBeVisible({ timeout: LLM_WAIT });
  await expect(answer.locator("[data-citation-mark]").first()).toBeVisible();
  await expect(thread.locator("[data-draft-card]")).toHaveCount(0);
  await expect(thread.getByRole("button", { name: "改为记录" })).toBeVisible();
  expect(await usage(page)).toEqual({ entry: before.entry, ask: before.ask + 1 });
  await shot(page, "INTENT-BOT-2-step1-answer");
});
