import { expect, type Page, test } from "@playwright/test";
import { pinClock, registerUser, seedGraph, shot } from "./support/bot.ts";
import { enableGraphHook, graphReady, graphView } from "./support/graph.ts";

test.use({ viewport: { width: 1440, height: 900 } });

/** Points at a year on the timeline's track and clicks there (a drag that ends there). */
async function dragTimelineTo(page: Page, year: number) {
  const thumb = page.getByRole("slider", { name: "时间" });
  const min = Number(await thumb.getAttribute("aria-valuemin"));
  const max = Number(await thumb.getAttribute("aria-valuemax"));
  const track = page.locator("[data-graph-timeline] [data-orientation=horizontal]").first();
  const box = await track.boundingBox();
  if (!box) throw new Error("no timeline");
  const x = box.x + 8 + ((box.width - 16) * (year - min)) / (max - min);
  const start = await thumb.boundingBox();
  if (!start) throw new Error("no thumb");
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
}

/** graph-viz BOT-2 〔AC-14〕 the timeline: 2013, 2026 (tension), play to today. */
test("GRAPH BOT-2 时间轴拖动与播放", async ({ page }) => {
  await pinClock(page);
  await enableGraphHook(page);
  const user = await registerUser(page);
  seedGraph(user.username);
  await page.goto("/graph");
  await graphReady(page, 25);
  const year = page.locator("[data-timeline-year]");
  await expect(year).toHaveText("今天");

  // 1. 把时间轴拖到 2013 年。
  await dragTimelineTo(page, 2013.5);
  await expect(year).toHaveText("2013 年");
  await expect(page).toHaveURL(/at=2013-/);
  await expect.poll(async () => (await graphView(page)).visible).not.toContain("张伟");
  const in2013 = (await graphView(page)).visible;
  expect(in2013).toContain("我");
  expect(in2013).not.toContain("李明"); // met 2015
  await expect.poll(async () => (await graphView(page)).animating).toBe(false);
  await shot(page, "GRAPH-BOT-2-step1-2013");

  // 2. 拖到 2026 年：老张与小李的线是红色（2025 年起紧张）。
  await dragTimelineTo(page, 2026.3);
  await expect(year).toHaveText("2026 年");
  await expect.poll(async () => (await graphView(page)).visible).toContain("张伟");
  const g = await graphView(page);
  expect(g.edges["张伟|李明"]).toMatchObject({ tense: true, color: "#C81E1E" });
  await expect.poll(async () => (await graphView(page)).animating).toBe(false);
  await shot(page, "GRAPH-BOT-2-step2-2026");

  // 3. 点播放，等待到结束。
  await page.getByRole("button", { name: "播放" }).click();
  await expect(year).toHaveText("今天", { timeout: 10_000 });
  await expect(page.getByRole("button", { name: "播放" })).toBeVisible();
  await expect(page).not.toHaveURL(/at=/);
});
