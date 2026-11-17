import { expect, type Page, test } from "@playwright/test";
import {
  expectNoHorizontalScroll,
  personId,
  pinClock,
  registerUser,
  seedGraph,
  shot,
} from "./support/bot.ts";

type Rendered = { x: number; y: number };

/** Where Cytoscape drew the node with this label, in page coordinates. */
async function nodePoint(page: Page, label: string): Promise<Rendered> {
  const box = await page.locator("[data-relation-graph]").boundingBox();
  if (!box) throw new Error("graph not on screen");
  const at = await page.evaluate((name) => {
    type Node = { data: (k: string) => string; renderedPosition: () => { x: number; y: number } };
    const cy = (window as unknown as { __weftCy: { nodes: () => { toArray: () => Node[] } } })
      .__weftCy;
    const node = cy
      .nodes()
      .toArray()
      .find((n) => n.data("label") === name);
    return node ? node.renderedPosition() : null;
  }, label);
  if (!at) throw new Error(`no node ${label}`);
  return { x: box.x + at.x, y: box.y + at.y };
}

const graphNames = (page: Page) =>
  page.getByRole("list", { name: "图中的人物" }).getByRole("button").allTextContents();

/** BOT-9 〔AC-33, AC-34, AC-35〕 local graph 1 → 2 hops, tap a person, filter the panorama. */
test("BOT-9 局部图、点击跳转、全景图筛选、375px 无横向滚动", async ({ page }) => {
  await pinClock(page);
  const user = await registerUser(page);
  seedGraph(user.username);
  const laozhang = await personId(page, "老张");
  const xiaoli = await personId(page, "小李");

  // 1. 打开老张的人物页，查看局部图，切换到两层。
  await page.goto(`/people/${laozhang}`);
  await expect(page.locator('[data-relation-graph="local"]')).toBeVisible();
  await expect.poll(async () => (await graphNames(page)).length).toBeGreaterThan(1);
  const oneHop = (await graphNames(page)).length;
  await expectNoHorizontalScroll(page);
  await page.getByRole("radio", { name: "2 层" }).click();
  await expect.poll(async () => (await graphNames(page)).length).toBeGreaterThan(oneHop);
  await page.locator("[data-relation-graph]").scrollIntoViewIfNeeded();
  await shot(page, "BOT-9-step1-local-graph");

  // 2. 在图中点击小李（李明）。
  await page.getByRole("radio", { name: "1 层" }).click();
  await expect.poll(async () => (await graphNames(page)).length).toBe(oneHop);
  await page.waitForTimeout(300);
  const point = await nodePoint(page, "李明");
  await page.mouse.click(point.x, point.y);
  await expect(page).toHaveURL(new RegExp(`/people/${xiaoli}$`));
  await expect(page.getByRole("heading", { name: "李明", level: 2 })).toBeVisible();
  await expectNoHorizontalScroll(page);

  // 3. 打开全景图，筛选关系大类“社会”、亲密度“亲近及以上”。
  await page.goto("/people");
  await expectNoHorizontalScroll(page);
  await page.getByRole("button", { name: "全景图" }).click();
  await expect(page).toHaveURL(/\/graph$/);
  await expect.poll(async () => (await graphNames(page)).length).toBeGreaterThan(20);
  const all = (await graphNames(page)).length;
  await expectNoHorizontalScroll(page);
  await page.getByRole("button", { name: /筛选/ }).click();
  const sheet = page.getByRole("dialog", { name: "筛选" });
  await sheet.getByRole("button", { name: "社会", exact: true }).click();
  await sheet.getByRole("button", { name: "亲近及以上" }).click();
  await sheet.getByRole("button", { name: "完成" }).click();
  const expected = (await (
    await page.request.get("/api/graph?category=social&closeness=close")
  ).json()) as { nodes: { name: string; is_self: boolean }[] };
  const names = expected.nodes.map((n) => (n.is_self ? "我" : n.name)).sort();
  await expect.poll(async () => (await graphNames(page)).sort()).toEqual(names);
  expect(names.length).toBeLessThan(all);
  expect(names).toContain("张伟");
  expect(names).not.toContain("陈静"); // 熟悉, below 亲近
  await shot(page, "BOT-9-step3-panorama-filtered");

  // 4. 在每个页面检查有没有横向滚动条。
  for (const path of [
    "/",
    "/entries",
    "/people",
    `/people/${laozhang}`,
    `/people/${laozhang}/relationships/${xiaoli}`,
    "/graph",
    "/me",
    "/me/taxonomy",
    "/me/delete-account",
    "/people/nope",
  ]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expectNoHorizontalScroll(page);
  }
});
