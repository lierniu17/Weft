import { expect, test } from "@playwright/test";
import { pinClock, registerUser, seedGraph, shot } from "./support/bot.ts";
import { clickPerson, graphReady, graphView } from "./support/graph.ts";

test.use({ viewport: { width: 1440, height: 900 } });

const angleGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
};

/** graph-viz BOT-1 〔AC-1, AC-4, AC-10, AC-13〕 rings, 间接认识, focus, filter fade / only. */
test("GRAPH BOT-1 同心环、间接认识、聚焦、筛选淡化与只显示符合的人", async ({ page }) => {
  await pinClock(page);
  const user = await registerUser(page);
  seedGraph(user.username);

  // 1. 打开全景图。
  await page.goto("/graph");
  await graphReady(page, 25);
  await expect.poll(async () => (await graphView(page)).animating).toBe(false);
  let g = await graphView(page);
  // 至交 (爸爸、妈妈、老婆、老张) share the innermost ring; everyone else is further out
  const intimate = ["陈建国", "王秀英", "刘婷", "张伟"];
  const inner = Math.max(...intimate.map((n) => g.rings[n]));
  expect(Math.min(...intimate.map((n) => g.rings[n]))).toBeGreaterThan(inner - 2);
  for (const [name, r] of Object.entries(g.rings)) {
    if (name !== "我" && !intimate.includes(name)) expect(r, name).toBeGreaterThan(inner + 2);
  }
  // 老张的女儿 on the outermost ring, next to 老张
  const outer = Math.max(...Object.values(g.rings));
  expect(g.rings["老张的女儿"]).toBeGreaterThan(outer - 2);
  expect(angleGap(g.angles["张伟"], g.angles["老张的女儿"])).toBeLessThan(20);
  await shot(page, "GRAPH-BOT-1-step1-panorama");

  // 2. 点击“张伟（老张）”。
  await clickPerson(page, "张伟");
  const card = page.getByRole("region", { name: "张伟的卡片" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("社会 · 同事");
  await expect(card).toContainText("我对他：至交 · 他对我：亲近");
  g = await graphView(page);
  expect(g.emphasized).toEqual(expect.arrayContaining(["张伟", "我", "李明", "王浩", "吴昊"]));
  expect(g.faded).toContain("刘婷");
  expect(g.faded).not.toContain("李明");
  await shot(page, "GRAPH-BOT-1-step2-focus");

  // 3. 按 Esc。
  await page.keyboard.press("Escape");
  await expect(card).toBeHidden();
  await expect.poll(async () => (await graphView(page)).emphasized).toBeNull();

  // 4. 打开筛选，只选“社会”。
  await page.getByRole("button", { name: /^筛选/ }).click();
  const sheet = page.getByRole("dialog", { name: "筛选" });
  await sheet.getByRole("button", { name: "社会", exact: true }).click();
  await expect.poll(async () => (await graphView(page)).faded).toContain("陈建国");
  g = await graphView(page);
  expect(g.faded).toEqual(expect.arrayContaining(["陈建国", "王秀英", "苏珊", "马超"]));
  expect(g.faded).not.toContain("张伟");
  expect(g.visible).toContain("陈建国");
  await shot(page, "GRAPH-BOT-1-step4-filter-fade");

  // 5. 切换为“只显示符合的人”。
  await sheet.getByRole("button", { name: "只显示符合的人" }).click();
  await expect.poll(async () => (await graphView(page)).visible).not.toContain("陈建国");
  g = await graphView(page);
  expect(g.visible).toContain("张伟");
  expect(g.visible).not.toContain("苏珊");
  await expect(page).toHaveURL(/only=1/);
});
