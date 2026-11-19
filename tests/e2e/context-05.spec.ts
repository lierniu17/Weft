import { expect, test } from "@playwright/test";
import { pinClock, registerUser, seedGraph, shot, usage } from "./support/bot.ts";
import { answerOf, askWifeAfterWork, followsOf } from "./support/context.ts";
import { LLM_WAIT, REMOTE } from "./support/env.ts";

/**
 * Conversation context BOT-5 〔AC-9, AC-10〕 连续追问: 「那他老婆呢？」 is read with
 * 「老张在哪上班？」 and says so above the answer; 「不接上文」 answers it again on its own
 * (here: nothing in the graph), replacing the answer; three asks in all.
 */
test("CONTEXT BOT-5 连续追问与不接上文", { tag: "@llm" }, async ({ page }) => {
  test.skip(REMOTE, "relies on the replayed reading of the follow-up with the 上文");
  await pinClock(page);
  const user = await registerUser(page);
  seedGraph(user.username);
  await page.goto("/");
  const before = await usage(page);

  // 1. 发送“老张在哪上班？”。2. 发送“那他老婆呢？”。
  const { second } = await askWifeAfterWork(page);
  await answerOf(second).scrollIntoViewIfNeeded();
  await shot(page, "CONTEXT-BOT-5-step2-follows");

  // 3. 点第 2 条回答上方的“不接上文”。
  await followsOf(second).getByRole("button", { name: "不接上文" }).click();
  await expect(answerOf(second)).toContainText("图谱里没有相关信息", { timeout: LLM_WAIT });
  await expect(answerOf(second)).not.toContainText("黄丽");
  await expect(followsOf(second)).toHaveCount(0);
  expect(await usage(page)).toEqual({ entry: before.entry, ask: before.ask + 3 });
});
