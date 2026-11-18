import { expect, test } from "@playwright/test";
import { PASSWORD, pinClock, registerUser, seedGraph, shot } from "./support/bot.ts";
import { enableGraphHook, graphReady, graphView } from "./support/graph.ts";

test.use({ viewport: { width: 1440, height: 900 } });

/** graph-viz BOT-4 〔AC-18〕 图谱外观 星空, saved to the account, still there after re-login. */
test("GRAPH BOT-4 图谱外观切到星空并保存到账户", async ({ page }) => {
  await pinClock(page);
  await enableGraphHook(page);
  const user = await registerUser(page);
  seedGraph(user.username);

  // 1. 在“我的”里把图谱外观切到“星空”。
  await page.goto("/me");
  const setting = page.getByRole("radiogroup", { name: "图谱外观" });
  await expect(setting.getByRole("radio", { name: "清蓝" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  const saved = page.waitForResponse(
    (r) => r.url().endsWith("/api/me/preferences") && r.request().method() === "PATCH",
  );
  await setting.getByRole("radio", { name: "星空" }).click();
  expect((await saved).status()).toBe(200);
  await expect(setting.getByRole("radio", { name: "星空" })).toHaveAttribute(
    "aria-checked",
    "true",
  );

  // 2. 打开全景图：图谱区域深色星空，页面其余部分仍是清蓝。
  await page.goto("/graph");
  await graphReady(page, 25);
  expect((await graphView(page)).theme).toBe("starfield");
  const frame = page.locator("[data-graph-frame]");
  await expect(frame).toHaveAttribute("data-graph-theme", "starfield");
  await expect(frame).toHaveCSS("background-color", "rgb(5, 7, 15)");
  await expect(page.locator("header").first()).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.locator("[data-graph-timeline]")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await shot(page, "GRAPH-BOT-4-step2-starfield");

  // 3. 退出并重新登录，再打开全景图。
  await page.goto("/me");
  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("账号", { exact: true }).fill(user.username);
  await page.getByLabel("密码", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
  await page.goto("/graph");
  await graphReady(page, 25);
  await expect.poll(async () => (await graphView(page)).theme).toBe("starfield");
  await expect(page.locator("[data-graph-frame]")).toHaveAttribute("data-graph-theme", "starfield");
});
