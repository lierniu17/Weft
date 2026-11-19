import { expect, test } from "@playwright/test";
import {
  draftCardOf,
  lastMonth,
  pinClock,
  registerUser,
  say,
  shot,
  threadOf,
  usage,
} from "./support/bot.ts";
import { LAOMA, LAOMA_ASKED } from "./support/context.ts";
import { LLM_WAIT, REMOTE } from "./support/env.ts";

const TYPED = "大概上个月中旬";

/**
 * Conversation context BOT-4 〔AC-7〕 a typed answer to a 补充追问: 「大概上个月中旬」 moves
 * the 发生日期 to last month (month precision), the question hides; only the one 记录 sent
 * is counted.
 */
test("CONTEXT BOT-4 草稿追问自己填", { tag: "@llm" }, async ({ page }) => {
  test.skip(REMOTE, "relies on the replayed enrichment asking when 前阵子 was");
  await pinClock(page);
  await registerUser(page);
  await page.goto("/");
  const before = await usage(page);

  // 1. 发送“前阵子见了老马”。
  await say(page, LAOMA);
  const card = draftCardOf(page, LAOMA);
  await expect(card.getByRole("status")).toHaveText(/草稿/, { timeout: LLM_WAIT });
  await expect(card.locator("[data-draft-question-line]")).toHaveText(`还差一点：${LAOMA_ASKED}`);

  // 2. 打开确认草稿，在“前阵子是什么时候？”下点“自己填”，输入“大概上个月中旬”。
  await card.getByRole("button", { name: "查看并确认" }).click();
  const sheet = page.getByRole("dialog", { name: "确认草稿" });
  const asked = sheet.getByRole("group", { name: LAOMA_ASKED });
  await asked.getByRole("button", { name: "自己填" }).click();
  await sheet.getByRole("textbox", { name: `自己填：${LAOMA_ASKED}` }).fill(TYPED);
  await sheet.getByRole("button", { name: "确定" }).click();
  const { y, m } = lastMonth();
  await expect(sheet.getByRole("button", { name: `发生在：${y} 年 ${m} 月` })).toBeVisible({
    timeout: LLM_WAIT,
  });
  await expect(sheet.getByText(LAOMA_ASKED)).toHaveCount(0);
  await expect(threadOf(page, LAOMA)).toContainText(`记录 · ${y} 年 ${m} 月`);
  expect(await usage(page)).toEqual({ entry: before.entry + 1, ask: before.ask });
  await shot(page, "CONTEXT-BOT-4-step2-typed");
});
