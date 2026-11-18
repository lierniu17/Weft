import { expect, test } from "@playwright/test";
import { draftCardOf, pinClock, registerUser, say, shot, threadOf, usage } from "./support/bot.ts";
import { LLM_WAIT, REMOTE } from "./support/env.ts";

// The replayed reading of 「老张最近好像换工作了吧」 is 拿不准 without a 反问 (intent clarify
// AC-1's fallback); the real model writes a 反问 for it, so this only runs against replays.
test.skip(
  REMOTE,
  "remote: relies on a scripted reading without a 反问 the real model does not give",
);

const THANKS = "谢谢";
const GUESS = "老张最近好像换工作了吧";

/**
 * Intent routing BOT-4 〔AC-6〕 无关 and 拿不准: a short reply with 记下来 / 帮我查, nothing
 * recorded, asked or counted — until the user picks one. 拿不准 here has no usable 反问, so
 * it keeps the fixed line (intent clarify AC-1).
 */
test("INTENT BOT-4 无关消息与拿不准", { tag: "@llm" }, async ({ page }) => {
  await pinClock(page);
  await registerUser(page);
  await page.goto("/");

  // 1. 发送“谢谢”。
  await say(page, THANKS);
  const thanks = threadOf(page, THANKS);
  const reply = thanks.locator("[data-chitchat-reply]");
  await expect(reply).toBeVisible({ timeout: LLM_WAIT });
  await expect(reply.getByRole("button", { name: "记下来" })).toBeVisible();
  await expect(reply.getByRole("button", { name: "帮我查" })).toBeVisible();
  await expect(thanks.locator("[data-draft-card]")).toHaveCount(0);
  await expect(thanks.getByRole("article", { name: "回答" })).toHaveCount(0);
  expect(await usage(page)).toEqual({ entry: 0, ask: 0 });

  // 2. 发送“老张最近好像换工作了吧”（回放为低置信度）。
  await say(page, GUESS);
  const guess = threadOf(page, GUESS);
  const unsure = guess.locator("[data-chitchat-reply]");
  await expect(unsure).toContainText("我没确定你是想记下来还是查询", { timeout: LLM_WAIT });
  await expect(unsure.getByRole("button", { name: "记下来" })).toBeVisible();
  await expect(unsure.getByRole("button", { name: "帮我查" })).toBeVisible();
  await expect(guess.locator("[data-clarify-reply]")).toHaveCount(0);
  await expect(guess.locator("[data-draft-card]")).toHaveCount(0);
  expect(await usage(page)).toEqual({ entry: 0, ask: 0 });
  await shot(page, "INTENT-BOT-4-step2-uncertain");

  // 3. 点第 2 条下的“记下来”。
  await unsure.getByRole("button", { name: "记下来" }).click();
  const card = draftCardOf(page, GUESS);
  await expect(card.getByRole("status")).toHaveText(/草稿/, { timeout: LLM_WAIT });
  await expect(guess.locator("[data-chitchat-reply]")).toHaveCount(0);
  await expect(guess.getByRole("button", { name: "改为提问" })).toBeVisible();
  expect(await usage(page)).toEqual({ entry: 1, ask: 0 });
});
