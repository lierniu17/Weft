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
import { clarifyOf, UNCERTAIN } from "./support/clarify.ts";
import { LLM_WAIT, REMOTE } from "./support/env.ts";

const TEXT = "老周最近好像不太顺吧";

/**
 * Intent clarify BOT-1 〔AC-1, AC-3〕 拿不准: a concrete 反问 with options instead of the
 * fixed line, nothing done or counted; clicking 「查：…」 answers the option's question, the
 * options go, one 提问 is counted.
 */
test("CLARIFY BOT-1 反问后点候选", { tag: "@llm" }, async ({ page }) => {
  await pinClock(page);
  const user = await registerUser(page);
  seedGraph(user.username);
  await page.goto("/");
  const before = await usage(page);

  // 1. 发送“老周最近好像不太顺吧”。
  await say(page, TEXT);
  const thread = threadOf(page, TEXT);
  const { reply, options } = clarifyOf(thread);
  await expect(reply).toBeVisible({ timeout: LLM_WAIT });
  await expect(reply).not.toContainText(UNCERTAIN);
  await expect(reply).toContainText(
    replayedOr("你是想记下“老周最近不太顺”，还是想查老周最近怎么样？", "老周"),
  );
  const labels = await options.getByRole("button").allTextContents();
  expect(labels.length).toBeGreaterThanOrEqual(1);
  expect(labels.length).toBeLessThanOrEqual(3);
  for (const label of labels) expect(label).toMatch(/^(记下|查|记下并查)：/);
  if (!REMOTE) expect(labels).toEqual(["记下：老周最近不太顺", "查：老周最近怎么样"]);
  await expect(thread.getByRole("button", { name: "记下来" })).toHaveCount(0);
  await expect(thread.locator("[data-draft-card]")).toHaveCount(0);
  await expect(thread.getByRole("article", { name: "回答" })).toHaveCount(0);
  expect(await usage(page)).toEqual(before);
  await shot(page, "CLARIFY-BOT-1-step1-clarify");

  // 2. 点“查：老周最近怎么样”。
  await options.getByRole("button", { name: /^查：/ }).first().click();
  const answer = thread.getByRole("article", { name: "回答" });
  await expect(answer).toBeVisible({ timeout: LLM_WAIT });
  if (!REMOTE) await expect(answer).toContainText("图谱里没有相关信息");
  await expect(options).toHaveCount(0);
  await expect(reply).toBeVisible(); // the question stays, above what it became
  await expect(thread.locator("[data-draft-card]")).toHaveCount(0);
  await expect(thread.getByRole("button", { name: "改为记录" })).toBeVisible();
  expect(await usage(page)).toEqual({ entry: before.entry, ask: before.ask + 1 });
  await answer.scrollIntoViewIfNeeded();
  await shot(page, "CLARIFY-BOT-1-step2-answered");
});
