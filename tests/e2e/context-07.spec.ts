import { expect, test } from "@playwright/test";
import { draftCardOf, pinClock, registerUser, say, shot } from "./support/bot.ts";
import { LILI_ASKED, LILI_VIDEO } from "./support/context.ts";
import { LLM_WAIT, REMOTE } from "./support/env.ts";

/**
 * Context gaps BOT-1 〔AC-1〕 a new person I spent time with, and nothing says who they
 * are: the model asks nothing, the Draft still asks 「莉莉是你的什么人？」; 「朋友」 fills
 * the relationship in and the question hides.
 */
test("CONTEXT BOT-7 新人物没说关系时补追问", { tag: "@llm" }, async ({ page }) => {
  test.skip(REMOTE, "relies on the replayed enrichment asking nothing");
  await pinClock(page);
  await registerUser(page);
  await page.goto("/");

  // 1. 发送“晚上和莉莉视频聊了一个小时”。
  await say(page, LILI_VIDEO);
  const card = draftCardOf(page, LILI_VIDEO);
  await expect(card.getByRole("status")).toHaveText(/草稿/, { timeout: LLM_WAIT });
  await expect(card.locator("[data-draft-question-line]")).toHaveText(`还差一点：${LILI_ASKED}`);
  await shot(page, "CONTEXT-BOT-7-step1-fallback-question");

  // 2. 打开确认草稿，点“朋友”。
  await card.getByRole("button", { name: "查看并确认" }).click();
  const sheet = page.getByRole("dialog", { name: "确认草稿" });
  const asked = sheet.getByRole("group", { name: LILI_ASKED });
  await expect(asked.getByRole("button")).toHaveText(["朋友", "同事", "同学", "亲戚", "自己填"]);
  await asked.getByRole("button", { name: "朋友" }).click();
  await expect(sheet.getByText(LILI_ASKED)).toHaveCount(0);
  await expect(sheet.locator("[data-relationship-type]")).toContainText("朋友");
  await expect(card.locator("[data-draft-question-line]")).toHaveCount(0);
});
