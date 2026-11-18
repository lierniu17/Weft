import { expect, type Page, test } from "@playwright/test";
import {
  expectNoHorizontalScroll,
  personId,
  pinClock,
  registerUser,
  seedGraph,
  shot,
} from "./support/bot.ts";

/** Width and horizontal centring of the page's content column inside its scroll area. */
async function contentBox(page: Page) {
  const content = page.locator("[data-page-content]").first();
  await expect(content).toBeVisible();
  return content.evaluate((el) => {
    const r = el.getBoundingClientRect();
    // the column centres itself in the area between the nav and any right column
    const area = (el.parentElement as HTMLElement).getBoundingClientRect();
    return {
      width: Math.round(r.width),
      leftGap: Math.round(r.left - area.left),
      rightGap: Math.round(area.right - r.right),
    };
  });
}

/**
 * Style refresh BOT-1 〔AC-5〕 desktop content is at most 720px wide and centred, the side
 * nav 232px and the chat's right column 380px; at 375px no page scrolls sideways.
 */
test("STYLE BOT-1 桌面限宽居中，手机无横向滚动", async ({ page }) => {
  await pinClock(page);
  const user = await registerUser(page);
  seedGraph(user.username);
  const zhang = await personId(page, "张伟");
  // The chat renders messages (intent routing); the seed writes the graph only, so one
  // question gives the chat a column of content.
  const asked = await page.request.post("/api/messages", {
    data: { text: "我是怎么认识小王的？" },
  });
  expect(asked.status(), await asked.text()).toBe(201);
  const pages = [
    ["chat", "/"],
    ["people", "/people"],
    ["person", `/people/${zhang}`],
    ["me", "/me"],
  ] as const;

  // 1440 × 900
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const [name, path] of pages) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const box = await contentBox(page);
    expect(box.width, `${name} content width`).toBeLessThanOrEqual(720);
    expect(box.width, `${name} uses the column`).toBe(720);
    expect(Math.abs(box.leftGap - box.rightGap), `${name} centred`).toBeLessThanOrEqual(1);
    const nav = page.getByRole("navigation", { name: "主导航" });
    expect(Math.round((await nav.boundingBox())?.width ?? 0)).toBe(232);
    if (name === "chat") {
      const right = page.getByRole("complementary", { name: "右栏" });
      expect(Math.round((await right.boundingBox())?.width ?? 0)).toBe(380);
    }
    if (name === "person") {
      const right = page.getByRole("complementary", { name: "关系图" });
      expect(Math.round((await right.boundingBox())?.width ?? 0)).toBe(380);
    }
    await expectNoHorizontalScroll(page);
    await shot(page, `STYLE-BOT-1-${name}-1440`);
  }

  // 375 × 812
  await page.setViewportSize({ width: 375, height: 812 });
  for (const [name, path] of pages) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expectNoHorizontalScroll(page);
    const box = await contentBox(page);
    expect(box.width, `${name} fills the phone`).toBe(375);
    await shot(page, `STYLE-BOT-1-${name}-375`);
  }
});
