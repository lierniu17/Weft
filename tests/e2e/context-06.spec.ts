import { expect, test } from "@playwright/test";
import { draftCardOf, pinClock, registerUser, seedGraph, shot, threadOf } from "./support/bot.ts";
import {
  askWhichLaozhou,
  askWifeAfterWork,
  confirmOf,
  dinnerWithXiaoli,
  followsOf,
  JIANGUO,
  LIKES,
  TAO,
  WHICH,
  WIFE,
  WORKS,
  XIAOLI_ASKED,
  XIAOLI_DINNER,
} from "./support/context.ts";
import { LLM_WAIT, REMOTE } from "./support/env.ts";

/**
 * Conversation context BOT-6 〔AC-11〕 after a reload everything comes back from the message
 * list: the 指代确认 still open with its candidates, the draft card's 补充追问, and
 * 「接着：…」 above the follow-up's answer.
 *
 * The record is sent first, before the seed graph is written: the seed already knows 小李
 * (a 大学同学), and a Draft does not ask what the graph already knows. 「老张在哪上班？」 is
 * then sent while the 指代确认 is open, so it is read with it — as a new question.
 */
test("CONTEXT BOT-6 刷新后确认、追问与接着上文都还原", { tag: "@llm" }, async ({ page }) => {
  test.skip(REMOTE, "relies on the replayed 指代确认, 补充追问 and follow-up");
  await pinClock(page);
  const user = await registerUser(page);
  await page.goto("/");

  // 前置：在同一用户下完成 BOT-3 第 1 步、BOT-1 第 1 步、BOT-5 第 1–2 步。
  await dinnerWithXiaoli(page);
  seedGraph(user.username);
  await askWhichLaozhou(page);
  await askWifeAfterWork(page);

  // 1. 刷新页面。
  await page.reload();
  const confirm = confirmOf(threadOf(page, LIKES));
  await expect(confirm.reply).toContainText(WHICH, { timeout: LLM_WAIT });
  await expect(confirm.options.getByRole("button")).toHaveText([TAO, JIANGUO]);
  const card = draftCardOf(page, XIAOLI_DINNER);
  await expect(card.locator("[data-draft-question-line]")).toHaveText(`还差一点：${XIAOLI_ASKED}`);
  const follows = followsOf(threadOf(page, WIFE));
  await expect(follows).toContainText(`接着：${WORKS}`);
  await expect(follows.getByRole("button", { name: "不接上文" })).toBeVisible();
  await confirm.reply.scrollIntoViewIfNeeded();
  await shot(page, "CONTEXT-BOT-6-step1-restored");
});
