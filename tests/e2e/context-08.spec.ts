import { expect, test } from "@playwright/test";
import { pinClock, registerUser, say, seedGraph, shot, threadOf } from "./support/bot.ts";
import { answerOf, NEIGHBOUR } from "./support/context.ts";
import { LLM_WAIT, REMOTE } from "./support/env.ts";

/**
 * Context gaps BOT-2 〔AC-3〕 「在市一院上班的那个邻居叫什么？」: of my two neighbours only
 * 林芳 works at 市一院 — she is the answer, with its source, not 「图谱里没有相关信息」.
 */
test("CONTEXT BOT-8 按描述找人", { tag: "@llm" }, async ({ page }) => {
  test.skip(REMOTE, "relies on the replayed answer about the one neighbour that fits");
  await pinClock(page);
  const user = await registerUser(page);
  seedGraph(user.username);
  await page.goto("/");

  // 1. 发送“在市一院上班的那个邻居叫什么？”。
  await say(page, NEIGHBOUR);
  const answer = answerOf(threadOf(page, NEIGHBOUR));
  await expect(answer).toContainText("林芳", { timeout: LLM_WAIT });
  await expect(answer).not.toContainText("图谱里没有相关信息");
  await expect(answer.locator("[data-citation-mark]").first()).toBeVisible();
  await shot(page, "CONTEXT-BOT-8-step1-described");

  await answer.locator("[data-citation-mark]").first().click();
  const citation = page.getByRole("dialog", { name: /出处/ });
  await expect(citation).toContainText("她在市一院当护士");
});
