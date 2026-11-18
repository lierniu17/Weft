import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { registerUser, seedGraph } from "./support/bot.ts";
import { SCREENSHOTS } from "./support/env.ts";
import { enableGraphHook, graphReady, graphView } from "./support/graph.ts";

/** Frames per second the page managed while `interact` ran (requestAnimationFrame count). */
async function fps(page: Page, interact: () => Promise<void>): Promise<number> {
  await page.evaluate(() => {
    const w = window as unknown as { __fps: { frames: number; on: boolean; start: number } };
    w.__fps = { frames: 0, on: true, start: performance.now() };
    const tick = () => {
      if (!w.__fps.on) return;
      w.__fps.frames++;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await interact();
  return page.evaluate(() => {
    const w = window as unknown as { __fps: { frames: number; on: boolean; start: number } };
    w.__fps.on = false;
    return w.__fps.frames / ((performance.now() - w.__fps.start) / 1000);
  });
}

/** Three seconds of continuous dragging and wheel zooming over the graph. */
async function dragAndZoom(page: Page) {
  const box = await page.locator("[data-relation-graph]").boundingBox();
  if (!box) throw new Error("no graph");
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const reach = Math.min(box.width, box.height) / 4;
  const end = Date.now() + 3000;
  let k = 0;
  while (Date.now() < end) {
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 0; i <= 12 && Date.now() < end; i++) {
      const a = (i / 12) * Math.PI * 2;
      await page.mouse.move(cx + Math.cos(a) * reach, cy + Math.sin(a) * reach);
    }
    await page.mouse.up();
    await page.mouse.wheel(0, k++ % 2 ? 240 : -240);
  }
}

const results: Record<string, unknown> = {};

// Frame rate is a property of the device: measure on the machine's GPU, not on Chromium's
// software rasteriser (SwiftShader), which headless runs fall back to without these flags.
test.use({
  launchOptions: {
    args: [
      "--enable-gpu",
      "--ignore-gpu-blocklist",
      ...(process.platform === "win32" ? ["--use-angle=d3d11"] : ["--use-angle=gl"]),
    ],
  },
});

/**
 * graph-viz BOT-5 〔AC-21, AC-19〕 300 people: dragging and zooming for 3 s stays ≥ 50 fps
 * at 1440 and ≥ 30 fps at 375; with reduced motion no animation loop keeps running.
 */
test("GRAPH BOT-5 300 人拖动缩放帧率与减少动效", async ({ page }) => {
  test.setTimeout(240_000);
  await enableGraphHook(page);
  const user = await registerUser(page);
  seedGraph(user.username, 300);
  // 星空 is the heavier theme (glow, stars, flowing dots): measure that.
  expect(
    (await page.request.patch("/api/me/preferences", { data: { graph_theme: "starfield" } })).ok(),
  ).toBe(true);

  await page.goto("/graph");
  results.renderer = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    return info && gl ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "unknown";
  });

  for (const [viewport, floor] of [
    [{ width: 1440, height: 900 }, 50],
    [{ width: 375, height: 812 }, 30],
  ] as const) {
    await page.setViewportSize(viewport);

    // normal motion: frame rate while dragging and zooming
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/graph");
    await graphReady(page, 290);
    await page.waitForTimeout(800);
    const measured = await fps(page, () => dragAndZoom(page));
    results[`${viewport.width} fps`] = Math.round(measured * 10) / 10;
    expect(measured, `fps at ${viewport.width}`).toBeGreaterThanOrEqual(floor);
    expect((await graphView(page)).animating).toBe(true); // stars + flowing dots

    // reduced motion: nothing loops once settled
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/graph");
    await graphReady(page, 290);
    await page.waitForTimeout(500);
    for (let i = 0; i < 5; i++) {
      expect((await graphView(page)).animating, `loop at ${viewport.width}`).toBe(false);
      await page.waitForTimeout(200);
    }
    results[`${viewport.width} reduced-motion loop`] = false;
  }
  writeFileSync(resolve(SCREENSHOTS, "GRAPH-BOT-5-fps.json"), JSON.stringify(results, null, 2));
});
