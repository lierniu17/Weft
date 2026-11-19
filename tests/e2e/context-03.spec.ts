import { expect, test } from "@playwright/test";
import { pinClock, registerUser, shot, usage } from "./support/bot.ts";
import { dinnerWithXiaoli, XIAOLI_ASKED } from "./support/context.ts";
import { LLM_WAIT, REMOTE } from "./support/env.ts";

/**
 * Conversation context BOT-3 〔AC-4, AC-5, AC-6, AC-8〕 the draft asks who 小李 is: the card
 * shows the question, the review sheet has it at the top; 「同事」 fills the relationship in
 * and the question hides; confirmed, 小李's page shows 同事.
 */
test("CONTEXT BOT-3 草稿追问点候选后确认", { tag: "@llm" }, async ({ page }) => {
  test.skip(REMOTE, "relies on the replayed enrichment asking a 补充追问");
  await pinClock(page);
  await registerUser(page);
  await page.goto("/");

  // 1. 发送“今天和小李吃饭了”。
  const card = await dinnerWithXiaoli(page);
  await shot(page, "CONTEXT-BOT-3-step1-draft-question");
  const before = await usage(page);

  // 2. 在草稿卡上看到追问后，打开确认草稿：追问在顶部。
  await card.getByRole("button", { name: "查看并确认" }).click();
  const sheet = page.getByRole("dialog", { name: "确认草稿" });
  await expect(sheet.getByRole("heading", { level: 3 }).first()).toHaveText("还差一点");
  const asked = sheet.getByRole("group", { name: XIAOLI_ASKED });
  await expect(asked.getByRole("button")).toHaveText(["同事", "同学", "自己填"]);

  // 3. 点追问下的“同事”。
  await asked.getByRole("button", { name: "同事" }).click();
  await expect(sheet.getByText(XIAOLI_ASKED)).toHaveCount(0);
  await expect(sheet.getByRole("heading", { name: "还差一点" })).toHaveCount(0);
  await expect(sheet.locator("[data-relationship-type]")).toContainText("同事");
  await expect(sheet).toContainText("我是小李的同事");
  await expect(card.locator("[data-draft-question-line]")).toHaveCount(0);
  expect(await usage(page)).toEqual(before); // answering counts nothing
  await shot(page, "CONTEXT-BOT-3-step3-answered");

  // 4. 确认。
  await sheet.getByRole("button", { name: "确认入图谱" }).click();
  await expect(sheet).toBeHidden();
  await expect(card.getByRole("status")).toHaveText(/已入图谱/, { timeout: LLM_WAIT });
  await card.getByRole("button", { name: "小李" }).click();
  await expect(page).toHaveURL(/\/people\//);
  await expect(page.getByText("同事").first()).toBeVisible({ timeout: LLM_WAIT });
});
