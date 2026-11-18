import { expect, test } from "@playwright/test";
import { personId, pinClock, registerUser, say, seedGraph, shot } from "./support/bot.ts";
import { LLM_WAIT } from "./support/env.ts";
import { clickPerson, enableGraphHook, graphReady, graphView } from "./support/graph.ts";

/** graph-viz BOT-3 〔AC-12, AC-16, AC-17〕 在图上查看 from Q&A, 清除, local graph → person. */
for (const viewport of [
  { width: 375, height: 812 },
  { width: 1440, height: 900 },
]) {
  const desktop = viewport.width >= 1200;
  test(`GRAPH BOT-3 问答在图上查看（${viewport.width}）`, { tag: "@llm" }, async ({ page }) => {
    await page.setViewportSize(viewport);
    await pinClock(page);
    await enableGraphHook(page);
    const user = await registerUser(page);
    seedGraph(user.username);
    await page.goto("/");

    // 1. 在问答里问“我是怎么认识小王的？”。
    await say(page, "我是怎么认识小王的？");
    const answer = page.getByRole("article", { name: "回答" }).first();
    await expect(answer.getByRole("list", { name: "人脉路径" })).toBeVisible({ timeout: LLM_WAIT });

    // 2. 点“在图上查看”。
    await answer.getByRole("button", { name: "在图上查看" }).click();
    let scope = page.locator("main");
    if (desktop) {
      // the right column, the chat stays
      await expect(page).toHaveURL(/\/$/);
      const panel = page.getByRole("dialog", { name: "全景图" });
      await expect(panel).toBeVisible();
      await expect(page.locator("[data-drawer-mask]")).toHaveCount(0);
      await expect(page.getByRole("textbox", { name: /内容/ })).toBeEditable();
      scope = panel;
    } else {
      await expect(page).toHaveURL(/\/graph$/);
    }
    const bar = scope.locator("[data-graph-answer]");
    await expect(bar).toContainText("老张");
    await graphReady(page, 20);
    await expect
      .poll(async () => (await graphView(page)).emphasized?.sort())
      .toEqual(["张伟", "我", "王浩"].sort());
    const g = await graphView(page);
    expect(g.highlight?.kind).toBe("path");
    expect(g.faded).toContain("刘婷");
    await expect.poll(async () => (await graphView(page)).highlight?.litSteps).toBe(2);
    await shot(page, `GRAPH-BOT-3-step2-answer-${viewport.width}`);

    // 3. 点“清除”。
    await bar.getByRole("button", { name: "清除" }).click();
    await expect(bar).toBeHidden();
    await expect.poll(async () => (await graphView(page)).emphasized).toBeNull();

    // 4. 打开老张的人物页，切换到 2 层，点击图中的小李。
    const laozhang = await personId(page, "老张");
    const xiaoli = await personId(page, "小李");
    await page.goto(`/people/${laozhang}`);
    await page.getByRole("radio", { name: "2 层" }).click();
    await expect.poll(async () => (await graphView(page)).visible.length).toBeGreaterThan(6);
    await expect.poll(async () => (await graphView(page)).animating).toBe(false);
    await page.locator("[data-relation-graph]").scrollIntoViewIfNeeded();
    await clickPerson(page, "李明");
    await page
      .getByRole("region", { name: "李明的卡片" })
      .getByRole("button", { name: "查看人物页" })
      .click();
    await expect(page).toHaveURL(new RegExp(`/people/${xiaoli}$`));
  });
}
