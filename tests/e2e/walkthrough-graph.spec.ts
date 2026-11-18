/**
 * graph-viz walkthrough (`pnpm e2e:walkthrough`): the relationship graph against the real
 * stack — results in screenshots/walkthrough/graph-results.json, screenshots next to the
 * prototype ones (compare-*.png) for the AC-UI-1 side-by-side check.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { pinClock, registerUser, say, seedGraph } from "./support/bot.ts";
import { ROOT, SCREENSHOTS } from "./support/env.ts";
import { enableGraphHook, graphReady, graphView } from "./support/graph.ts";

const OUT = resolve(SCREENSHOTS, "walkthrough");
mkdirSync(OUT, { recursive: true });
const results: Record<string, unknown> = {};

async function snap(page: Page, name: string) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(OUT, `${name}.png`) });
}

async function axe(page: Page) {
  await page.addScriptTag({ path: resolve(ROOT, "node_modules/axe-core/axe.min.js") });
  return page.evaluate(async () => {
    // biome-ignore lint/suspicious/noExplicitAny: axe is injected at runtime
    const r = await (window as any).axe.run(document, { resultTypes: ["violations"] });
    return r.violations.map(
      (v: { id: string; nodes: { target: string[] }[] }) =>
        `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`,
    );
  });
}

test.use({ contextOptions: { reducedMotion: "no-preference" } });

test.afterAll(() => {
  writeFileSync(resolve(OUT, "graph-results.json"), JSON.stringify(results, null, 2));
});

/**
 * graph-viz AC-UI-1…3: the panorama in 清蓝 and 星空 at 375 / 1440, the answer path lit, and
 * the list view — screenshots for the side-by-side check against design-refs/graph-viz/
 * (compare-*.png put both next to each other), axe on the graph and on the list view.
 */
test("graph-viz walkthrough", { tag: "@llm" }, async ({ page }) => {
  test.setTimeout(300_000);
  await pinClock(page);
  await enableGraphHook(page);
  const user = await registerUser(page);
  seedGraph(user.username);
  const settledGraph = async () => {
    await graphReady(page, 25);
    await expect
      .poll(async () => (await graphView(page)).animating, { timeout: 5000 })
      .toBe((await graphView(page)).theme === "starfield");
    await page.waitForTimeout(400);
  };
  const shots: [string, string][] = [];

  for (const theme of ["light", "starfield"] as const) {
    expect(
      (await page.request.patch("/api/me/preferences", { data: { graph_theme: theme } })).ok(),
    ).toBe(true);
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
      await page.goto("/graph");
      await settledGraph();
      const g = await graphView(page);
      results[`graph-viz ${theme} ${width}`] = {
        theme: g.theme,
        halos: g.halos.length,
        labels: g.labels.length,
        labelOverlaps: g.labelOverlaps,
        visible: g.visible.length,
        animating: g.animating,
      };
      expect.soft(g.labelOverlaps, `names overlap: ${theme} ${width}`).toEqual([]);
      await snap(page, `graph-${theme}-${width}`);
      shots.push([
        theme === "light" ? "light.png" : "starfield-path.png",
        `graph-${theme}-${width}`,
      ]);
      results[`graph-viz axe graph ${theme} ${width}`] = await axe(page);
      await page.getByRole("radio", { name: "列表" }).click();
      await expect(page.locator("[data-graph-list]")).toBeVisible();
      results[`graph-viz axe list ${theme} ${width}`] = await axe(page);
      if (theme === "light") await snap(page, `graph-list-${width}`);
    }
  }

  // the answer path lit, 星空: phone → 全景图, desktop → the chat's right column
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: width < 768 ? 812 : 900 });
    await page.goto("/");
    await say(page, "我是怎么认识小王的？");
    const answer = page.getByRole("article", { name: "回答" }).last();
    await expect(answer.getByRole("button", { name: "在图上查看" })).toBeVisible({
      timeout: 60_000,
    });
    await answer.getByRole("button", { name: "在图上查看" }).click();
    await graphReady(page, 25);
    await expect.poll(async () => (await graphView(page)).highlight?.litSteps).toBe(2);
    await page.waitForTimeout(500);
    const lit = await graphView(page);
    results[`graph-viz path ${width}`] = { labels: lit.labels, labelOverlaps: lit.labelOverlaps };
    expect.soft(lit.labelOverlaps, `names overlap: path ${width}`).toEqual([]);
    await snap(page, `graph-starfield-${width}-path`);
    shots.push(["starfield-path.png", `graph-starfield-${width}-path`]);
    results[`graph-viz axe path ${width}`] = await axe(page);
  }

  // timeline at 2013, 星空 (cf. starfield-timeline-2013.png)
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/graph?at=2013-06");
  await graphReady(page, 2);
  await page.waitForTimeout(800);
  await snap(page, "graph-starfield-1440-2013");
  shots.push(["starfield-timeline-2013.png", "graph-starfield-1440-2013"]);

  for (const key of Object.keys(results).filter((k) => k.startsWith("graph-viz axe"))) {
    expect.soft(results[key], key).toEqual([]);
  }

  // side by side: the prototype screenshot | ours
  for (const [ref, ours] of shots) {
    const html = `<body style="margin:0;display:flex;gap:16px;background:#E9EBF0;align-items:flex-start">
      <figure style="margin:0"><figcaption style="font:12px sans-serif;padding:4px">prototype · ${ref}</figcaption>
      <img src="${pathToFileURL(resolve(ROOT, "design-refs/graph-viz", ref)).href}" style="height:900px"></figure>
      <figure style="margin:0"><figcaption style="font:12px sans-serif;padding:4px">Weft · ${ours}</figcaption>
      <img src="${pathToFileURL(resolve(OUT, `${ours}.png`)).href}" style="height:900px"></figure></body>`;
    const file = resolve(OUT, `compare-${ours}.html`);
    writeFileSync(file, html);
    await page.setViewportSize({ width: 2400, height: 940 });
    await page.goto(pathToFileURL(file).href);
    await page.waitForLoadState("load");
    await page.screenshot({ path: resolve(OUT, `compare-${ours}.png`), fullPage: true });
    rmSync(file);
  }
});
