import { expect, test } from "@playwright/test";
import {
  draftCardOf,
  lastMonth,
  personId,
  pinClock,
  recordConfirmed,
  registerUser,
  replayedOr,
  shot,
  submitRecord,
} from "./support/bot.ts";
import { LLM_WAIT } from "./support/env.ts";

const BALL = "周末和小李打球，感觉他最近对我挺冷淡的，我倒还是把他当好兄弟";

/** BOT-13 〔AC-17, AC-30, AC-32〕 discard a draft, add 球友, an asymmetric feeling. */
test("BOT-13 放弃草稿、自定义小类与不对称感受", { tag: "@llm" }, async ({ page }) => {
  await pinClock(page);
  const me = await registerUser(page);
  // 前置：图谱里已有小李；本人对小李的亲密度为“亲近”（上个月记录）。
  const { y, m } = lastMonth(); // local: 2026-10-20
  await recordConfirmed(page, "上个月和小李吃饭聊到很晚，我们挺亲近的。", {
    occurredOn: `${y}-${String(m).padStart(2, "0")}-20`,
  });
  const xiaoli = await personId(page, "小李");
  const graphBefore = await (await page.request.get("/api/graph")).json();
  await page.goto("/");

  // 1. 写一条随便的记录并提交，在草稿页点放弃并确认。
  await submitRecord(page, "随便写的一句话");
  const casual = draftCardOf(page, "随便写的一句话");
  await expect(casual.getByRole("status")).toHaveText(/草稿/, { timeout: LLM_WAIT });
  await casual.getByRole("button", { name: "查看并确认" }).click();
  const sheet = page.getByRole("dialog", { name: "确认草稿" });
  await sheet.getByRole("button", { name: "放弃" }).click();
  const modal = page.getByRole("alertdialog", { name: "放弃这份草稿？" });
  await modal.getByRole("button", { name: "放弃" }).click();
  await expect(casual.getByRole("status")).toHaveText("已放弃");
  await page.goto("/entries");
  await expect(
    page.getByRole("button", { name: /随便写的一句话/ }).locator("[data-entry-status]"),
  ).toHaveText("已放弃");
  expect(await (await page.request.get("/api/graph")).json()).toEqual(graphBefore);

  // 2. 在设置的关系词表里，于“社会”大类下新增小类“球友”。
  await page.goto("/me");
  await page.getByRole("button", { name: /关系类型词表/ }).click();
  await page.getByRole("button", { name: "在「社会」下新增小类" }).click();
  await page.getByLabel("新小类名称").fill("球友");
  await page.getByRole("button", { name: "添加", exact: true }).click();
  await expect(page.getByRole("region", { name: "社会" })).toContainText("球友（自定义）");

  // 3. 写记录，提交。
  await page.goto("/");
  await submitRecord(page, BALL);
  const card = draftCardOf(page, BALL);
  await expect(card.getByRole("status")).toHaveText(/草稿/, { timeout: LLM_WAIT });

  // 4. 在草稿里把本人与小李的关系类型选为“球友”，确认。
  await card.getByRole("button", { name: "查看并确认" }).click();
  await expect(sheet.getByRole("button", { name: /修改关系类型/ }).first()).toBeVisible();
  // A real model may already classify the pair as the new custom subtype (AC-32: custom
  // subtypes take part in extraction). Then there is nothing to change; otherwise the user
  // picks 球友 for the first relationship type, as the spec's step describes.
  const alreadyBall = sheet.getByRole("button", { name: "修改关系类型「社会 · 球友」" });
  if ((await alreadyBall.count()) === 0) {
    await sheet
      .getByRole("button", { name: /修改关系类型/ })
      .first()
      .click();
    const option = sheet.getByRole("button", { name: "球友（自定义）" });
    await expect(option).toBeVisible();
    await option.click();
  }
  await expect(sheet.locator("[data-relationship-type]").first()).toBeVisible();
  await expect(
    sheet.locator("[data-relationship-type]").filter({ hasText: "社会 · 球友" }),
  ).toHaveCount(1);
  await shot(page, "BOT-13-step4-draft");
  await sheet.getByRole("button", { name: "确认入图谱" }).click();
  await expect(card.getByRole("status")).toHaveText(/已入图谱/);

  // 5. 打开本人与小李的关系页，展开“小李对我”的亲密度历史。
  await page.goto(`/people/${me.self_person_id}/relationships/${xiaoli}`);
  const overview = page.locator("[data-relationship-overview]");
  await expect(overview).toContainText("社会 · 球友");
  const mine = page.locator("[data-feeling-row]").filter({ hasText: "我 → 小李" });
  const theirs = page.locator("[data-feeling-row]").filter({ hasText: "小李 → 我" });
  await expect(mine).toContainText("我 → 小李：亲近");
  await expect(theirs).toContainText(/小李 → 我：(一般|疏远)/);
  await theirs.getByRole("button", { name: "历史" }).click();
  const history = theirs.getByRole("list", { name: "小李 → 我 的感受变化" });
  await expect(history).toContainText("今天");
  // Spec: 一般或疏远 (the replayed fixture says 一般).
  await expect(history).toContainText(
    replayedOr<string | RegExp>("亲密度 一般", /亲密度 (一般|疏远)/),
  );
  await expect(history.getByRole("img", { name: "可信度：推测" })).toBeVisible();
  await shot(page, "BOT-13-step5-relationship");
});
