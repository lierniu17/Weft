import { expect, test } from "@playwright/test";
import { pinClock, registerUser, seedGraph, shot, usage } from "./support/bot.ts";
import { answerOf, askWhichLaozhou, TAO } from "./support/context.ts";
import { LLM_WAIT, REMOTE } from "./support/env.ts";

/**
 * Conversation context BOT-1 〔AC-1, AC-2〕 指代确认 then a click: two 老周 in the graph, so
 * the question gets a confirmation and candidates instead of an answer (one ask counted);
 * clicking 周涛 answers about him with 出处, the candidates go, nothing more is counted.
 */
test("CONTEXT BOT-1 指代确认后点候选", { tag: "@llm" }, async ({ page }) => {
  test.skip(REMOTE, "relies on the replayed 指代确认; a real model may answer either 老周 or both");
  await pinClock(page);
  const user = await registerUser(page);
  seedGraph(user.username);
  await page.goto("/");
  const before = await usage(page);

  // 1. 发送“老周喜欢什么？”。
  const { thread, confirm } = await askWhichLaozhou(page);
  await expect(thread.locator("[data-draft-card]")).toHaveCount(0);
  expect(await usage(page)).toEqual({ entry: before.entry, ask: before.ask + 1 });
  await shot(page, "CONTEXT-BOT-1-step1-confirm");

  // 2. 点“老周（周涛，大学同学）”。
  await confirm.options.getByRole("button", { name: TAO }).click();
  const answer = answerOf(thread);
  await expect(answer).toContainText("周涛", { timeout: LLM_WAIT });
  await expect(answer).toContainText("钓鱼");
  await expect(answer.getByRole("button", { name: /^出处/ }).first()).toBeVisible();
  await expect(confirm.options).toHaveCount(0);
  await expect(confirm.reply).toBeVisible(); // the question stays, the answer under it
  expect(await usage(page)).toEqual({ entry: before.entry, ask: before.ask + 1 });
  await answer.scrollIntoViewIfNeeded();
  await shot(page, "CONTEXT-BOT-1-step2-answered");
});
