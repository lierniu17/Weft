/**
 * AC-UI-1…10 walkthrough against the real stack (`pnpm e2e:walkthrough`), at 375 / 1024 /
 * 1440 px. Everything a machine can measure is measured here with `expect.soft` (so every
 * item is reported); the screenshots in tests/e2e/screenshots/walkthrough/ are for the
 * side-by-side comparison with the wireframes and final.html that needs human eyes.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  draftCardOf,
  personId,
  pinClock,
  recordConfirmed,
  registerUser,
  seedGraph,
  submitRecord,
} from "./support/bot.ts";
import { ROOT, SCREENSHOTS } from "./support/env.ts";

const OUT = resolve(SCREENSHOTS, "walkthrough");
mkdirSync(OUT, { recursive: true });
const results: Record<string, unknown> = {};

async function snap(page: Page, name: string) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(OUT, `${name}.png`) });
}

const style = (page: Page, selector: string, props: string[]) =>
  page
    .locator(selector)
    .first()
    .evaluate(
      (el, ps) => Object.fromEntries(ps.map((p) => [p, getComputedStyle(el).getPropertyValue(p)])),
      props,
    );

/** Visible solid-primary buttons (bg #4F46E5) on screen. */
const primaryCount = (page: Page, scope = "body") =>
  page.evaluate(
    (root) =>
      [...(document.querySelector(root)?.querySelectorAll("button, a") ?? [])].filter((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return (
          r.width > 0 &&
          r.height > 0 &&
          cs.visibility !== "hidden" &&
          cs.backgroundColor === "rgb(79, 70, 229)" &&
          r.width > 44
        );
      }).length,
    scope,
  );

/** Waits for an element's running animations (e.g. a panel's slide-in) to finish. */
const settled = (el: Locator) =>
  el.evaluate((e) => Promise.all(e.getAnimations().map((a) => a.finished)).then(() => true));

/**
 * A page's right-side sheet (出处 / 筛选), opened from `trigger`. From 1200px it is the
 * non-modal right column (D1–D3): no mask, in the page flow, the page beside it usable,
 * focus in on open, Esc pressed outside leaves it open, Esc inside closes it and focus goes
 * back to the trigger. Below 1200px it stays a modal drawer with a mask.
 */
async function sidePanel(page: Page, trigger: Locator, name: RegExp | string, shot: string) {
  await trigger.click();
  const panel = page.getByRole("dialog", { name });
  await expect(panel).toBeVisible();
  await settled(panel);
  const r: Record<string, unknown> = {
    mask: await page.locator("[data-drawer-mask]").count(),
    ...(await panel.evaluate((el) => {
      const b = el.getBoundingClientRect();
      return {
        // A modal Radix dialog hides the rest of the app from assistive tech.
        pageHidden: Boolean(document.querySelector("main")?.closest("[aria-hidden=true]")),
        inPageFlow: getComputedStyle(el).position !== "fixed" && Boolean(el.closest("main")),
        width: Math.round(b.width),
        right: Math.round(window.innerWidth - b.right),
      };
    })),
    focusInPanel: await panel.evaluate((el) => el.contains(document.activeElement)),
  };
  await snap(page, shot);
  if (r.mask === 0) {
    // The page beside the panel: nothing covers the trigger, and it still takes clicks.
    r.triggerHitTestable = await trigger.evaluate((el) => {
      const b = el.getBoundingClientRect();
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return Boolean(hit && el.contains(hit));
    });
    await trigger.click();
    r.pageInteractive =
      (await trigger.evaluate((el) => el === document.activeElement)) && (await panel.isVisible());
    // Esc with focus outside the panel keeps it open.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    r.escOutsideKeepsOpen = await panel.isVisible();
    r.axe = await axe(page);
    await panel.getByRole("button", { name: "关闭" }).focus();
  }
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  r.escInsideCloses = true;
  r.focusBack = await trigger.evaluate((el) => el === document.activeElement);
  return r;
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

// Measure the real transitions here (the BOT config asks for reduced motion).
test.use({ contextOptions: { reducedMotion: "no-preference" } });

test.afterAll(() => {
  writeFileSync(resolve(OUT, "results.json"), JSON.stringify(results, null, 2));
});

test("AC-UI walkthrough", async ({ page }) => {
  test.setTimeout(300_000);
  await pinClock(page);
  await page.setViewportSize({ width: 375, height: 812 });

  // --- 375: first use (AC-UI-3), then a seeded graph ----------------------------------
  // AC-UI-4: the primary button at rest / hover / pressed, on the login page.
  await page.goto("/login");
  const login = page.getByRole("button", { name: "登录" });
  const bg = () => login.evaluate((el) => getComputedStyle(el).backgroundColor);
  const primary: Record<string, unknown> = { rest: await bg() };
  primary.radius = await login.evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
  primary.transition = await login.evaluate((el) => getComputedStyle(el).transitionDuration);
  await login.hover();
  await page.waitForTimeout(400);
  primary.hover = await bg();
  await page.mouse.down();
  await page.waitForTimeout(400);
  primary.active = await bg();
  await page.mouse.up();
  primary.input = await style(page, "input", ["border-top-left-radius", "height"]);
  results["AC-UI-4 primary button"] = primary;
  await page.mouse.move(0, 0);

  const user = await registerUser(page);
  await page.goto("/");
  await expect(page.locator('[data-empty-state="first-use"]')).toBeVisible();
  results["AC-UI-3 first-use examples"] = await page
    .getByRole("list", { name: "示例记录" })
    .getByRole("button")
    .count();
  await snap(page, "375-chat-first-use");
  await page.goto("/people");
  await page.locator('[data-empty-state="no-people"]').waitFor();
  results["AC-UI-3 people empty"] = await page
    .locator('[data-empty-state="no-people"]')
    .isVisible();
  await snap(page, "375-people-empty");
  await page.goto("/people/does-not-exist");
  await page.getByRole("heading", { name: "这个人物不存在" }).waitFor();
  results["AC-UI-3 not-found"] = await page
    .getByRole("heading", { name: "这个人物不存在" })
    .isVisible();
  await snap(page, "375-person-not-found");

  seedGraph(user.username);
  await recordConfirmed(page, "老张是个急性子。");
  const laozhang = await personId(page, "老张");
  const xiaoli = await personId(page, "小李");

  // --- 375: chat with a draft + answer (AC-UI-1, 2, 9, 10) ----------------------------
  await page.goto("/");
  await submitRecord(page, "今天和老张吃饭，他说他女儿明年高考，他最近迷上了钓鱼，不过他不喝酒。");
  const card = draftCardOf(page, "迷上了钓鱼");
  await expect(card.getByRole("status")).toHaveText(/草稿/, { timeout: 60_000 });
  results["AC-UI-10 one draft card per entry"] = await page
    .locator("[data-entry-thread]")
    .filter({ hasText: "迷上了钓鱼" })
    .locator("[data-draft-card]")
    .count();
  results["AC-UI-9 draft status is a live region"] = await card
    .getByRole("status")
    .getAttribute("aria-live");
  results["AC-UI-1 composer: record|ask + date chip (record)"] = {
    modes: await page
      .getByRole("radiogroup", { name: "输入类型" })
      .getByRole("radio")
      .allTextContents(),
    dateChipInRecord: await page.getByRole("button", { name: /发生日期/ }).isVisible(),
  };
  await page.getByRole("radio", { name: "提问" }).click();
  results["AC-UI-1 date chip hidden in ask"] = !(await page
    .getByRole("button", { name: /发生日期/ })
    .isVisible());
  await page.getByRole("radio", { name: "记录" }).click();
  results["AC-UI-1 记录 entry top-right"] = await page
    .locator("header")
    .getByRole("button", { name: "记录" })
    .isVisible();
  results["AC-UI-1 bottom tabs"] = await page
    .getByRole("navigation", { name: "主导航" })
    .getByRole("button")
    .allTextContents();
  await snap(page, "375-chat-draft-pending");
  results["AC-UI-6 primary buttons on chat (375)"] = await primaryCount(page);
  results["AC-UI-9 axe chat (375)"] = await axe(page);

  // keyboard: open the draft review with the keyboard, focus stays inside, Esc closes
  await card.getByRole("button", { name: "查看并确认" }).focus();
  await page.keyboard.press("Enter");
  const sheet = page.getByRole("dialog", { name: "确认草稿" });
  await expect(sheet).toBeVisible();
  await settled(sheet);
  for (let i = 0; i < 12; i++) await page.keyboard.press("Tab");
  results["AC-UI-9 focus trapped in sheet"] = await sheet.evaluate((el) =>
    el.contains(document.activeElement),
  );
  results["AC-UI-1 draft review is a bottom sheet"] = await sheet.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      bottom: Math.round(window.innerHeight - r.bottom),
      radiusTop: getComputedStyle(el).borderTopLeftRadius,
    };
  });
  results["AC-UI-10 sheet animation"] = await sheet.evaluate(
    (el) => getComputedStyle(el).animationName,
  );
  results["AC-UI-6 primary buttons in draft sheet"] = await primaryCount(page, '[role="dialog"]');
  await snap(page, "375-draft-review");
  await page.keyboard.press("Escape");
  results["AC-UI-9 Esc closes sheet"] = !(await sheet.isVisible());
  // discard modal: equal widths, danger outline
  await card.getByRole("button", { name: "查看并确认" }).click();
  await sheet.getByRole("button", { name: "放弃" }).click();
  const modal = page.getByRole("alertdialog");
  const widths = await modal.getByRole("button").evaluateAll((els) =>
    els.map((e) => ({
      text: e.textContent,
      width: Math.round(e.getBoundingClientRect().width),
      bg: getComputedStyle(e).backgroundColor,
      border: getComputedStyle(e).borderTopColor,
      color: getComputedStyle(e).color,
    })),
  );
  results["AC-UI-6 discard modal buttons"] = widths;
  await snap(page, "375-discard-modal");
  await modal.getByRole("button", { name: "取消" }).click();
  await expect(modal).toBeHidden(); // its exit fade (motion.sheet-exit) is over
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  // ask with the keyboard
  await page.getByRole("radio", { name: "提问" }).click();
  await page.getByRole("textbox", { name: "提问内容" }).fill("老张和小李是什么关系？");
  await page.keyboard.press("Control+Enter");
  const answer = page.getByRole("article", { name: "回答" }).last();
  await expect(answer).toContainText("室友", { timeout: 60_000 });
  results["AC-UI-1 back to 记录 after asking"] = await page
    .getByRole("radio", { name: "记录" })
    .isChecked();
  await answer.scrollIntoViewIfNeeded();
  await snap(page, "375-chat-answer");
  await answer.locator("[data-citation-mark]").first().click();
  await snap(page, "375-citation-sheet");
  await page.keyboard.press("Escape");

  // --- AC-UI-4 token spot checks on real pages ----------------------------------------
  const tokens: Record<string, unknown> = {};
  tokens.body = await style(page, "html", [
    "background-color",
    "color",
    "font-family",
    "font-size",
    "line-height",
  ]);
  tokens.card = await style(page, "[data-draft-card]", [
    "background-color",
    "border-top-left-radius",
  ]);
  tokens.bubble = await style(page, "[data-bubble]", [
    "background-color",
    "border-top-left-radius",
    "border-bottom-right-radius",
  ]);
  tokens.chip = await style(page, "[data-draft-card] [class*=rounded-full]", [
    "border-top-left-radius",
  ]);
  tokens.input = await style(page, "textarea", ["border-top-left-radius"]);
  tokens.secondaryText = await style(page, "[data-bubble] + p, p.text-caption", ["color"]);
  results["AC-UI-4 computed tokens"] = tokens;
  results["AC-UI-4 spacing values used"] = await page.evaluate(() => {
    const seen = new Set<string>();
    for (const el of document.querySelectorAll("body *")) {
      const cs = getComputedStyle(el);
      for (const p of ["paddingTop", "paddingLeft", "marginTop", "rowGap", "columnGap"] as const) {
        const v = cs[p];
        if (v && v !== "0px" && v !== "normal") seen.add(v);
      }
    }
    return [...seen].sort();
  });

  // --- 375: people / person / relationship / panorama / me ---------------------------
  for (const [name, path] of [
    ["people", "/people"],
    ["person", `/people/${laozhang}`],
    ["relationship", `/people/${laozhang}/relationships/${xiaoli}`],
    ["panorama", "/graph"],
    ["me", "/me"],
    ["taxonomy", "/me/taxonomy"],
    ["entries", "/entries"],
    ["delete-account", "/me/delete-account"],
  ] as const) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await snap(page, `375-${name}`);
    results[`AC-UI-6 primary buttons on ${name}`] = await primaryCount(page);
    results[`AC-UI-9 axe ${name}`] = await axe(page);
    results[`AC-UI-7 375 overflow ${name}`] = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
  }
  await page.goto("/me/delete-account");
  results["AC-UI-6 delete-account buttons"] = await page
    .getByRole("form", { name: "注销账户" })
    .getByRole("button", { name: /取消|注销/ })
    .evaluateAll((els) =>
      els.map((e) => ({
        text: e.textContent,
        width: Math.round(e.getBoundingClientRect().width),
        bg: getComputedStyle(e).backgroundColor,
        border: getComputedStyle(e).borderTopColor,
      })),
    );
  await page.goto(`/people/${laozhang}`);
  await page.getByRole("button", { name: "更多操作" }).click();
  await page.getByRole("menuitem", { name: "删除人物" }).click();
  results["AC-UI-6 delete-person modal buttons"] = await page
    .getByRole("alertdialog")
    .getByRole("button")
    .evaluateAll((els) =>
      els.map((e) => ({
        text: e.textContent,
        width: Math.round(e.getBoundingClientRect().width),
        bg: getComputedStyle(e).backgroundColor,
      })),
    );
  await snap(page, "375-delete-person-modal");
  await page.keyboard.press("Escape");
  // AC-UI-8: long text truncation in the person list
  await page.goto("/people");
  results["AC-UI-8 list title truncates"] = await page
    .locator("[data-list-item-title]")
    .first()
    .evaluate((el) => getComputedStyle(el).textOverflow);
  results["AC-UI-10 list row hover transition"] = await page
    .locator("[data-list-item]")
    .nth(1)
    .evaluate((el) => getComputedStyle(el).transitionDuration);

  // --- 1024 (tablet) and 1440 (desktop) -----------------------------------------------
  for (const width of [1024, 1440, 1680]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const nav = page.getByRole("navigation", { name: "主导航" });
    results[`AC-UI-7 ${width} layout`] = {
      sideNavWidth: Math.round((await nav.boundingBox())?.width ?? 0),
      sideNavItems: await nav
        .getByRole("button")
        .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? e.textContent)),
      recentHeading: await nav.getByRole("heading", { name: "最近提到" }).isVisible(),
      rightPanelWidth: await page.evaluate(() =>
        Math.round(
          document.querySelector('aside[aria-label="右栏"]')?.getBoundingClientRect().width ?? 0,
        ),
      ),
      tabBar: await page.evaluate(() => document.querySelectorAll("nav").length),
      contentBox: await page.locator("main").evaluate((el) => {
        const r = el.parentElement?.getBoundingClientRect();
        return r ? { left: Math.round(r.left), width: Math.round(r.width) } : null;
      }),
      overflow: await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    };
    await snap(page, `${width}-chat`);
    if (width !== 1680) results[`AC-UI-9 axe chat (${width})`] = await axe(page);
    const card2 = page.locator("[data-draft-card=pending]").first();
    if (await card2.count()) {
      const trigger = card2.getByRole("button", { name: "查看并确认" });
      await trigger.click();
      const s = page.getByRole("dialog", { name: "确认草稿" });
      await expect(s).toBeVisible();
      await settled(s);
      results[`AC-UI-1 ${width} draft in right panel`] = await s.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return {
          width: Math.round(r.width),
          right: Math.round(window.innerWidth - r.right),
          height: Math.round(r.height),
        };
      });
      // Desktop (D1): a non-modal column beside the chat; tablet keeps the modal panel.
      const panel = {
        mask: await page.locator("[data-drawer-mask]").count(),
        focusInPanel: await s.evaluate((el) => el.contains(document.activeElement)),
        chatInteractive: false,
        escInComposerKeepsOpen: false,
        focusBack: false,
      };
      if (width >= 1200) {
        const box = page.getByRole("textbox", { name: "记录内容" });
        await box.click();
        await box.fill("面板开着也能写");
        panel.chatInteractive =
          (await box.inputValue()) === "面板开着也能写" && (await s.isVisible());
        // Esc in the composer is the composer's: the panel stays open.
        await page.keyboard.press("Escape");
        await page.waitForTimeout(200);
        panel.escInComposerKeepsOpen = await s.isVisible();
        await box.fill("");
        if (!panel.escInComposerKeepsOpen) await trigger.click(); // keep measuring the rest
        await s.getByRole("button", { name: "关闭" }).focus();
      }
      await snap(page, `${width}-draft-panel`);
      if (width === 1440) results["AC-UI-9 axe chat with draft panel (1440)"] = await axe(page);
      await page.keyboard.press("Escape");
      await expect(s).toBeHidden();
      panel.focusBack = await trigger.evaluate((el) => el === document.activeElement);
      results[`AC-UI-1 ${width} panel behaviour`] = panel;
      if (width >= 1200) {
        expect.soft(panel).toEqual({
          mask: 0,
          focusInPanel: true,
          chatInteractive: true,
          escInComposerKeepsOpen: true,
          focusBack: true,
        });
      }
    }
    await page.goto(`/people/${laozhang}`);
    await page.waitForLoadState("networkidle");
    await snap(page, `${width}-person`);
    const panels: Record<string, Record<string, unknown>> = {};
    panels.person = await sidePanel(
      page,
      page.locator("[data-profile-section]").getByRole("button", { name: "急性子", exact: true }),
      /出处/,
      `${width}-person-citation-panel`,
    );
    await page.goto(`/people/${laozhang}/relationships/${xiaoli}`);
    await page.waitForLoadState("networkidle");
    await snap(page, `${width}-relationship`);
    panels.relationship = await sidePanel(
      page,
      page.getByRole("button", { name: /查看关系的出处/ }),
      /出处/,
      `${width}-relationship-citation-panel`,
    );
    await page.goto("/graph");
    await page.waitForLoadState("networkidle");
    await snap(page, `${width}-panorama`);
    panels.panorama = await sidePanel(
      page,
      page.getByRole("button", { name: /筛选/ }),
      "筛选",
      `${width}-panorama-filter-panel`,
    );
    for (const [name, r] of Object.entries(panels)) {
      results[`AC-UI-7 ${width} ${name} side panel`] = r;
      if (width >= 1200) {
        expect.soft(r, `${width} ${name} panel`).toEqual({
          mask: 0,
          pageHidden: false,
          inPageFlow: true,
          width: 380,
          right: expect.any(Number),
          focusInPanel: true,
          triggerHitTestable: true,
          pageInteractive: true,
          escOutsideKeepsOpen: true,
          axe: [],
          escInsideCloses: true,
          focusBack: true,
        });
      } else {
        expect.soft(r, `${width} ${name} panel`).toMatchObject({
          mask: 1,
          pageHidden: true,
          focusInPanel: true,
          escInsideCloses: true,
          focusBack: true,
        });
      }
    }
  }
});
