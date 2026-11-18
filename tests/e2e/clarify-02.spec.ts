import { expect, test } from "@playwright/test";
import { pinClock, registerUser, shot, usage } from "./support/bot.ts";
import { answerZhouNews } from "./support/clarify.ts";

/**
 * Intent clarify BOT-2 〔AC-4〕 a typed answer to the 反问: read together with the original,
 * the merged 记录 (老周 was laid off last month) is drafted under the answer; the 反问 is
 * resolved; one 记录 is counted.
 */
test("CLARIFY BOT-2 打字回答反问后记录", { tag: "@llm" }, async ({ page }) => {
  await pinClock(page);
  await registerUser(page);
  await page.goto("/");

  const { original, asked, card } = await answerZhouNews(page);
  await expect(asked.options).toHaveCount(0);
  await expect(asked.reply).toBeVisible();
  await expect(original.locator("[data-draft-card]")).toHaveCount(0);
  expect(await usage(page)).toEqual({ entry: 1, ask: 0 });
  await card.scrollIntoViewIfNeeded();
  await shot(page, "CLARIFY-BOT-2-step2-answered");
});
