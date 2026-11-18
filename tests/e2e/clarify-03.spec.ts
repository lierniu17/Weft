import { expect, test } from "@playwright/test";
import { draftCardOf, pinClock, registerUser, say, shot, threadOf, usage } from "./support/bot.ts";
import { clarifyOf, UNCERTAIN } from "./support/clarify.ts";
import { LLM_WAIT, REMOTE } from "./support/env.ts";

const TEXT = "阿杰这人吧，怎么说呢";
const VAGUE = "嗯……";
const UNRELATED = "今天和小林吃饭了";

/**
 * Intent clarify BOT-3 〔AC-5, AC-6〕 only one round: a vague answer gets the fixed line and
 * 记下来 / 帮我查, never a second 反问; the next, unrelated message is an ordinary 记录.
 */
test("CLARIFY BOT-3 只反问一轮，之后的新话照常处理", { tag: "@llm" }, async ({ page }) => {
  await pinClock(page);
  await registerUser(page);
  await page.goto("/");

  // 1. 发送“阿杰这人吧，怎么说呢”（拿不准，反问）。
  await say(page, TEXT);
  const first = threadOf(page, TEXT);
  const asked = clarifyOf(first);
  await expect(asked.reply).toBeVisible({ timeout: LLM_WAIT });
  await expect(asked.options.getByRole("button").first()).toBeVisible();

  // 2. 回复“嗯……”。
  await say(page, VAGUE);
  const vague = threadOf(page, VAGUE);
  const reply = vague.locator("[data-chitchat-reply]");
  await expect(reply).toBeVisible({ timeout: LLM_WAIT });
  // Replayed: the vague answer is 拿不准 and gets the fixed line. The real model may instead
  // read 「嗯……」 as plain chitchat with its own short reply; either way there is no 2nd 反问.
  if (!REMOTE) await expect(reply).toContainText(UNCERTAIN);
  await expect(reply.getByRole("button", { name: "记下来" })).toBeVisible();
  await expect(reply.getByRole("button", { name: "帮我查" })).toBeVisible();
  await expect(vague.locator("[data-clarify-reply]")).toHaveCount(0);
  await expect(vague.locator("[data-draft-card]")).toHaveCount(0);
  await expect(asked.options).toHaveCount(0); // answered (vaguely): the 反问 is settled
  expect(await usage(page)).toEqual({ entry: 0, ask: 0 });
  await shot(page, "CLARIFY-BOT-3-step2-fallback");

  // 3. 发送“今天和小林吃饭了”。
  await say(page, UNRELATED);
  const card = draftCardOf(page, UNRELATED);
  await expect(card.getByRole("status")).toHaveText(/草稿/, { timeout: LLM_WAIT });
  await expect(card).toContainText("小林");
  await expect(card).not.toContainText("阿杰");
  await expect(threadOf(page, UNRELATED).locator("[data-chitchat-reply]")).toHaveCount(0);
  await expect(reply.getByRole("button", { name: "记下来" })).toBeVisible();
  await expect(first.locator("[data-draft-card]")).toHaveCount(0);
  expect(await usage(page)).toEqual({ entry: 1, ask: 0 });
});
