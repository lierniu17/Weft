import { expect, test } from "@playwright/test";
import { ask, personId, pinClock, recordConfirmed, registerUser, shot } from "./support/bot.ts";

/** BOT-8 〔AC-4〕 user B can't see user A's persons, Entries, answers or panorama. */
test("BOT-8 两个账户交叉访问", async ({ browser }) => {
  // 前置：用户 A 和用户 B 各有自己的人物和记录，都有一个叫“老张”的人物。
  const a = await browser.newContext();
  const pageA = await a.newPage();
  await registerUser(pageA, "用户甲", "bot8a");
  const entryA = await recordConfirmed(pageA, "老张和陈静是我大学同学。");
  const personA = await personId(pageA, "老张");
  await a.close();

  const b = await browser.newContext();
  const page = await b.newPage();
  await pinClock(page);
  await registerUser(page, "用户乙", "bot8b");
  await recordConfirmed(page, "老张是我的邻居，人很热心。");

  // 1. 以 B 的身份登录，在地址栏直接打开 A 的人物页和记录页。
  await page.goto(`/people/${personA}`);
  await expect(page.getByRole("heading", { name: "这个人物不存在" })).toBeVisible();
  await shot(page, "BOT-8-step1-not-found");
  await page.goto(`/entries/${entryA.entryId}`);
  await expect(page.getByRole("heading", { name: "这条记录不存在" })).toBeVisible();

  // 2. 在 B 的问答里问“老张是什么样的人？”。
  await page.goto("/");
  await ask(page, "老张是什么样的人？");
  const answer = page.getByRole("article", { name: "回答" });
  await expect(answer).toContainText("热心", { timeout: 60_000 });
  await answer.locator("[data-citation-mark]").first().click();
  const citation = page.getByRole("dialog", { name: /出处/ });
  await expect(citation).toContainText("老张是我的邻居，人很热心。");
  await expect(citation).not.toContainText("大学同学");
  await page.keyboard.press("Escape");

  // 3. 打开 B 的全景图。
  await page.goto("/graph");
  const people = page.getByRole("list", { name: "图中的人物" });
  await expect(people.getByRole("button")).toHaveText(["我", "老张"]);
  await expect(people).not.toContainText("陈静");
  await b.close();
});
