import { expect, test } from "@playwright/test";
import { pinClock, registerUser, say, seedGraph, shot, threadOf, usage } from "./support/bot.ts";
import { answerOf, askWhichLaozhou } from "./support/context.ts";
import { LLM_WAIT, REMOTE } from "./support/env.ts";

const TYPED = "邻居那个";

/**
 * Conversation context BOT-2 〔AC-3〕 a typed answer to the 指代确认: 「邻居那个」 is read with
 * the question and answered about 周建国; the original's candidates go; one ask in all.
 */
test("CONTEXT BOT-2 打字说明指的是谁", { tag: "@llm" }, async ({ page }) => {
  test.skip(REMOTE, "relies on the replayed 指代确认 and its reading of the typed answer");
  await pinClock(page);
  const user = await registerUser(page);
  seedGraph(user.username);
  await page.goto("/");
  const before = await usage(page);

  // 1. 发送“老周喜欢什么？”。
  const { confirm } = await askWhichLaozhou(page);

  // 2. 输入“邻居那个”并发送。
  await say(page, TYPED);
  const typed = threadOf(page, TYPED);
  const answer = answerOf(typed);
  await expect(answer).toContainText("周建国", { timeout: LLM_WAIT });
  await expect(answer).toContainText("象棋");
  await expect(confirm.options).toHaveCount(0);
  await expect(typed.locator("[data-clarify-reply]")).toHaveCount(0);
  expect(await usage(page)).toEqual({ entry: before.entry, ask: before.ask + 1 });
  await answer.scrollIntoViewIfNeeded();
  await shot(page, "CONTEXT-BOT-2-step2-answered");
});
