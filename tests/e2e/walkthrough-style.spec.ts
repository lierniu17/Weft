/**
 * Style refresh walkthrough (AC-UI-1…3, `pnpm e2e:walkthrough`): every page at 375 and 1440,
 * an automated check that the UI chrome (everything but the relationship graph, whose
 * category colours stay, AC-11) carries no old indigo #4F46E5, and side-by-side images of
 * prototype 方案 A next to the app for 对话 / 人物 / 我的 — the comparison itself needs eyes.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { draftCardOf, personId, pinClock, registerUser, say, seedGraph } from "./support/bot.ts";
import { LLM_WAIT, ROOT, SCREENSHOTS } from "./support/env.ts";

const OUT = resolve(SCREENSHOTS, "style-refresh");
const AFTER = resolve(OUT, "after");
mkdirSync(AFTER, { recursive: true });
const PROTOTYPE = pathToFileURL(
  resolve(ROOT, "docs/prototypes/2026-11-18-style-refresh.html"),
).href;
const results: Record<string, unknown> = {};

async function snap(page: Page, name: string) {
  await page.waitForTimeout(400); // page enter / sheets settle
  await page.screenshot({ path: resolve(AFTER, `${name}.png`) });
}

/**
 * Every visible element outside the relationship graph (canvas, its frame, legend and list
 * colours are data, AC-11) whose colour, background, border, outline, fill or stroke is the
 * old indigo rgb(79, 70, 229).
 */
const oldIndigo = (page: Page) =>
  page.evaluate(() => {
    const INDIGO = "rgb(79, 70, 229)";
    const GRAPH = "[data-graph-frame], [data-graph-legend], canvas";
    const props = [
      "color",
      "background-color",
      "border-top-color",
      "border-right-color",
      "border-bottom-color",
      "border-left-color",
      "outline-color",
      "fill",
      "stroke",
      "box-shadow",
    ];
    const hits: string[] = [];
    for (const el of document.querySelectorAll("body *")) {
      if (el.closest(GRAPH)) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const cs = getComputedStyle(el);
      for (const p of props) {
        const v = cs.getPropertyValue(p);
        if (v.includes(INDIGO) || v.toUpperCase().includes("#4F46E5")) {
          hits.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} ${p}`);
        }
      }
    }
    return hits;
  });

async function check(page: Page, name: string) {
  const hits = await oldIndigo(page);
  results[`AC-UI-2 no #4F46E5 · ${name}`] = hits;
  expect.soft(hits, `old indigo on ${name}`).toEqual([]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  results[`AC-5 overflow · ${name}`] = overflow;
  expect.soft(overflow, `horizontal scroll on ${name}`).toBeLessThanOrEqual(0);
}

/** Prototype 方案 A at one page, both devices, as screenshots (the reference side). */
async function prototype(page: Page, p: "chat" | "person" | "me") {
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto(PROTOTYPE);
  await page.locator(`#segP [data-p="${p}"]`).click();
  await page.locator('#segM [data-m="off"]').click(); // settled frames, no mid-animation
  if (p === "chat") {
    // the 入图谱 state is the one the app's chat shows after confirming
    await page.locator('#phone [data-act="review"]').click();
    await page.locator('#psheet [data-act="confirm"]').click();
    await page.waitForTimeout(400);
  }
  await page.locator(".phone").screenshot({ path: resolve(OUT, `prototype-${p}-375.png`) });
  await page.locator("#desk").screenshot({ path: resolve(OUT, `prototype-${p}-1440.png`) });
}

async function compare(page: Page, p: string, width: 375 | 1440, ours: string) {
  const h = width === 375 ? 812 : 760;
  const html = `<body style="margin:0;padding:16px;display:flex;gap:24px;background:#E7E7EA;align-items:flex-start;font:13px sans-serif">
    <figure style="margin:0"><figcaption style="padding:4px 0 8px">原型 方案 A · ${p} · ${width}</figcaption>
    <img src="${pathToFileURL(resolve(OUT, `prototype-${p}-${width}.png`)).href}" style="height:${h}px"></figure>
    <figure style="margin:0"><figcaption style="padding:4px 0 8px">Weft · ${ours}</figcaption>
    <img src="${pathToFileURL(resolve(AFTER, `${ours}.png`)).href}" style="height:${h}px"></figure></body>`;
  const file = resolve(OUT, `compare-${p}-${width}.html`);
  writeFileSync(file, html);
  await page.setViewportSize({ width: width === 375 ? 900 : 2400, height: h + 80 });
  await page.goto(pathToFileURL(file).href);
  await page.waitForLoadState("load");
  await page.screenshot({ path: resolve(OUT, `compare-${p}-${width}.png`), fullPage: true });
  rmSync(file);
}

// Real transitions, as a person sees them (the BOT config asks for reduced motion).
test.use({ contextOptions: { reducedMotion: "no-preference" } });

test.afterAll(() => {
  writeFileSync(resolve(OUT, "results.json"), JSON.stringify(results, null, 2));
});

test("style refresh walkthrough", { tag: "@llm" }, async ({ page }) => {
  test.setTimeout(420_000);
  await pinClock(page);

  // --- signed out: 登录 / 注册 -----------------------------------------------------
  for (const width of [375, 1440] as const) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
    for (const [name, path] of [
      ["login", "/login"],
      ["register", "/register"],
    ] as const) {
      await page.goto(path);
      await page.getByRole("heading", { level: 1 }).waitFor();
      await snap(page, `${width}-${name}`);
      await check(page, `${name} ${width}`);
    }
  }

  // --- a new user: first use and empty states ----------------------------------------
  const user = await registerUser(page);
  for (const width of [375, 1440] as const) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
    for (const [name, path, ready] of [
      ["chat-first-use", "/", '[data-empty-state="first-use"]'],
      ["people-empty", "/people", '[data-empty-state="no-people"]'],
      ["not-found", "/nowhere", '[data-empty-state="not-found"]'],
    ] as const) {
      await page.goto(path);
      await page.locator(ready).waitFor();
      await snap(page, `${width}-${name}`);
      await check(page, `${name} ${width}`);
    }
  }

  // --- the seeded graph, a pending draft and an answer -------------------------------
  seedGraph(user.username);
  const zhang = await personId(page, "张伟");
  const li = await personId(page, "李明");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  const TEXT = "今天和老张吃饭，他说他女儿明年高考，他最近迷上了钓鱼，不过他不喝酒。";
  await say(page, TEXT);
  const card = draftCardOf(page, "迷上了钓鱼");
  await expect(card.getByRole("status")).toHaveText(/草稿/, { timeout: LLM_WAIT });
  for (const width of [375, 1440] as const) {
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
    // 对话 with the pending draft and an answer (answers live in the session: ask here),
    // then the 出处 and the review sheet / right panel
    await page.goto("/");
    await expect(card.getByRole("status")).toHaveText(/草稿/);
    await say(page, "老张和小李是什么关系？");
    await expect(page.getByRole("article", { name: "回答" }).last()).toContainText("室友", {
      timeout: LLM_WAIT,
    });
    await card.scrollIntoViewIfNeeded();
    await snap(page, `${width}-chat-draft-pending`);
    await check(page, `chat ${width}`);
    await page.getByRole("article", { name: "回答" }).last().scrollIntoViewIfNeeded();
    await snap(page, `${width}-chat-answer`);
    await page
      .getByRole("article", { name: "回答" })
      .last()
      .locator("[data-citation-mark]")
      .first()
      .click();
    await snap(page, `${width}-citation`);
    await check(page, `citation ${width}`);
    await page.keyboard.press("Escape");
    await card.getByRole("button", { name: "查看并确认" }).click();
    const sheet = page.getByRole("dialog", { name: "确认草稿" });
    await expect(sheet).toBeVisible();
    await snap(page, `${width}-draft-review`);
    await check(page, `draft review ${width}`);
    await sheet.getByRole("button", { name: "关闭" }).click();
    await expect(sheet).toBeHidden();

    for (const [name, path] of [
      ["people", "/people"],
      ["person", `/people/${zhang}`],
      ["relationship", `/people/${zhang}/relationships/${li}`],
      ["panorama", "/graph"],
      ["entries", "/entries"],
      ["me", "/me"],
      ["taxonomy", "/me/taxonomy"],
      ["delete-account", "/me/delete-account"],
    ] as const) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await snap(page, `${width}-${name}`);
      await check(page, `${name} ${width}`);
    }
    // 记录详情
    await page.goto("/entries");
    await page.locator("[data-entry-status]").first().click();
    await page.waitForLoadState("networkidle");
    await snap(page, `${width}-entry`);
    await check(page, `entry ${width}`);
  }

  // 草稿入图谱: confirm at 375, then the settled card at both widths
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await card.getByRole("button", { name: "查看并确认" }).click();
  await page
    .getByRole("dialog", { name: "确认草稿" })
    .getByRole("button", { name: "确认入图谱" })
    .click();
  await expect(card.getByRole("status")).toHaveText(/已入图谱/);
  await expect(card.locator("[data-draft-preview]")).toHaveCount(0);
  await card.scrollIntoViewIfNeeded();
  await snap(page, "375-chat-confirmed");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await card.scrollIntoViewIfNeeded();
  await snap(page, "1440-chat-confirmed");

  // --- prototype 方案 A next to the app ------------------------------------------------
  for (const p of ["chat", "person", "me"] as const) await prototype(page, p);
  for (const width of [375, 1440] as const) {
    await compare(page, "chat", width, `${width}-chat-confirmed`);
    await compare(page, "person", width, `${width}-person`);
    await compare(page, "me", width, `${width}-me`);
  }
});
