import { expect, test } from "@playwright/test";
import {
  draftCardOf,
  pinClock,
  registerUser,
  replayedOr,
  say,
  shot,
  threadOf,
} from "./support/bot.ts";
import { LLM_WAIT } from "./support/env.ts";

const TEXT = "今天和老张吃饭，他说他女儿明年高考，他最近迷上了钓鱼，不过他不喝酒。";

// The 入图谱 moment is checked with motion on (the BOT config asks for reduced motion).
test.use({ contextOptions: { reducedMotion: "no-preference" } });

/**
 * Style refresh BOT-2 〔AC-7, AC-8, AC-14〕 the draft lines are natural sentences; after
 * 确认入图谱 the sheet leaves, the same card folds to 「已入图谱 · N 条信息」 with a drawn
 * check, and the new persons appear as chips.
 */
test("STYLE BOT-2 草稿自然语句与入图谱动效", { tag: "@llm" }, async ({ page }) => {
  await pinClock(page);
  await registerUser(page);
  await page.goto("/");

  // AC-7: the composer is the focal point; empty → the send button is faint and inert.
  const send = page.getByRole("button", { name: "发送" });
  await expect(send).toBeDisabled();
  await expect(send).toHaveCSS("opacity", "0.25");
  await expect(page.locator("[data-composer-box]")).toHaveCSS("border-radius", "24px");

  // 1. 写记录并提交。
  await say(page, TEXT);
  const card = draftCardOf(page, TEXT);
  const status = card.getByRole("status");
  await expect(status).toHaveText(/^草稿 · \d+ 个人物 · \d+ 条信息$/, { timeout: LLM_WAIT });
  const items = Number((await status.textContent())?.match(/(\d+) 条信息/)?.[1]);
  // the record bubble is bg-muted, right-aligned
  const bubble = threadOf(page, TEXT).locator("[data-bubble]");
  await expect(bubble).toHaveCSS("background-color", "rgb(240, 240, 242)");

  // 2. 点“查看并确认”：信息行是自然语句，行尾灰色可信度。
  await card.getByRole("button", { name: "查看并确认" }).click();
  const sheet = page.getByRole("dialog", { name: "确认草稿" });
  await expect(sheet).toBeVisible();
  const lines = sheet.locator("[data-draft-item] [data-confidence-line]");
  await expect(lines).toHaveCount(items);
  await expect(
    lines.filter({ hasText: replayedOr("老张喜欢钓鱼 · 本人说", "喜欢钓鱼") }),
  ).toHaveCount(1);
  await expect(
    lines.filter({ hasText: replayedOr("老张不喜欢喝酒 · 本人说", "喝酒") }),
  ).toHaveCount(1);
  await expect(sheet).not.toContainText(/[A-Z]{2,}_[A-Z]|老张 · 喜欢/);
  await expect(lines.first().locator("[data-confidence]")).toHaveCSS("color", "rgb(113, 113, 122)");
  const discard = await sheet.getByRole("button", { name: "放弃" }).boundingBox();
  const confirm = sheet.getByRole("button", { name: "确认入图谱" });
  const confirmBox = await confirm.boundingBox();
  expect(Math.abs((discard?.width ?? 0) - (confirmBox?.width ?? 0))).toBeLessThanOrEqual(1);
  await expect(confirm).toHaveCSS("background-color", "rgb(24, 24, 27)");
  await shot(page, "STYLE-BOT-2-step2-draft");

  // 3. 点“确认入图谱”。
  const node = await card.elementHandle();
  await card.evaluate((el) => {
    (el as HTMLElement).dataset.botSame = "1";
  });
  await confirm.click();
  await expect(sheet).toBeHidden();
  await expect(status).toHaveText(new RegExp(`^已入图谱 · ${items} 条信息`));
  // the same DOM node, never a new card
  await expect(card).toHaveAttribute("data-bot-same", "1");
  expect(await node?.evaluate((el) => el.isConnected)).toBe(true);
  await expect(page.locator("[data-draft-card]")).toHaveCount(1);
  // the green check is drawn and the preview folds away into bg-subtle
  const check = card.locator("[data-draft-check] path");
  await expect(check).toHaveCSS("animation-name", "check-draw");
  await expect(card.locator("[data-draft-preview]")).toHaveCount(0);
  await expect(card).toHaveCSS("background-color", "rgb(247, 247, 248)");
  await expect(check).toHaveCSS("stroke-dashoffset", "0px");
  // the new persons appear as chips
  await expect(card.getByRole("button", { name: "老张", exact: true })).toBeVisible();
  await page.waitForTimeout(400); // the chips' pop has played
  await shot(page, "STYLE-BOT-2-step3-confirmed");
});
