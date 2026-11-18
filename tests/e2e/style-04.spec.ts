import { expect, type Page, test } from "@playwright/test";
import { draftCardOf, pinClock, registerUser, say } from "./support/bot.ts";
import { LLM_WAIT } from "./support/env.ts";

const TEXT = "今天和老张吃饭，他说他女儿明年高考，他最近迷上了钓鱼，不过他不喝酒。";

// 前置：系统开启“减少动态效果”（the BOT config's default, set again to be explicit）。
test.use({ contextOptions: { reducedMotion: "reduce" } });

/** CSS animations and transitions that are still running anywhere on the page. */
const running = (page: Page) =>
  page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a.playState === "running")
      .map((a) => (a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty),
  );

/**
 * Style refresh BOT-4 〔AC-16〕 with 「减少动态效果」 nothing animates: switching tabs, opening
 * and closing the review sheet and confirming a draft all switch directly.
 */
test("STYLE BOT-4 减少动态效果时直接切换", { tag: "@llm" }, async ({ page }) => {
  await pinClock(page);
  await registerUser(page);
  await page.goto("/");
  await say(page, TEXT);
  const card = draftCardOf(page, TEXT);
  await expect(card.getByRole("status")).toHaveText(/草稿/, { timeout: LLM_WAIT });
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(
    true,
  );

  // 1. 切换 tab。
  const tabs = page.getByRole("navigation", { name: "主导航" });
  await tabs.getByRole("button", { name: "人物" }).click();
  await expect(page).toHaveURL(/\/people$/);
  expect(await running(page)).toEqual([]);
  await tabs.getByRole("button", { name: "我的" }).click();
  expect(await running(page)).toEqual([]);
  await tabs.getByRole("button", { name: "对话" }).click();
  await expect(card.getByRole("status")).toHaveText(/草稿/);
  expect(await running(page)).toEqual([]);

  // 2. 打开并关闭确认草稿抽屉。
  await card.getByRole("button", { name: "查看并确认" }).click();
  const sheet = page.getByRole("dialog", { name: "确认草稿" });
  await expect(sheet).toBeVisible();
  expect(await running(page)).toEqual([]);
  await sheet.getByRole("button", { name: "关闭" }).click();
  await expect(sheet).toBeHidden();
  expect(await running(page)).toEqual([]);

  // 3. 确认一份草稿。
  await card.getByRole("button", { name: "查看并确认" }).click();
  await sheet.getByRole("button", { name: "确认入图谱" }).click();
  await expect(sheet).toBeHidden();
  await expect(card.getByRole("status")).toHaveText(/已入图谱/);
  expect(await running(page)).toEqual([]);
  // the state is there at once: folded, the check shown drawn
  await expect(card.locator("[data-draft-preview]")).toHaveCount(0);
  await expect(card.locator("[data-draft-check] path")).toHaveCSS("animation-name", "none");
  await expect(card.locator("[data-draft-check] path")).toHaveCSS("stroke-dashoffset", "0px");
});
