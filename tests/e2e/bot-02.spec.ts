import { expect, test } from "@playwright/test";
import { draftCardOf, pinClock, registerUser, shot, submitRecord } from "./support/bot.ts";
import { LLM_WAIT } from "./support/env.ts";

const TEXT = "今天和老张吃饭，他说他女儿明年高考，他最近迷上了钓鱼，不过他不喝酒。";

/** BOT-2 〔AC-6, AC-9, AC-10, AC-11, AC-21, AC-25〕 record → review → confirm → profile. */
test("BOT-2 写记录、改草稿、确认、看画像与出处", { tag: "@llm" }, async ({ page }) => {
  await pinClock(page);
  await registerUser(page);
  await page.goto("/");

  // 1. 写记录，提交。
  await submitRecord(page, TEXT);
  const card = draftCardOf(page, TEXT);

  // 2. 等待草稿进入待确认。
  await expect(card.getByRole("status")).toHaveText(/草稿 · \d+ 个人物 · 3 条信息/, {
    timeout: LLM_WAIT,
  });
  await expect(page.locator("[data-draft-card]")).toHaveCount(1); // in place, not appended
  await card.getByRole("button", { name: "查看并确认" }).click();
  const sheet = page.getByRole("dialog", { name: "确认草稿" });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('[data-person-match="new"]')).toContainText("老张");
  for (const item of ["喜欢 钓鱼", "不喜欢 喝酒", "女儿明年高考"]) {
    await expect(sheet.getByText(item, { exact: false })).toBeVisible();
  }
  await expect(sheet.getByRole("button", { name: /可信度：本人说/ })).toHaveCount(3);
  // 确认前人物列表里没有老张
  const before = await (await page.request.get("/api/persons?q=老张")).json();
  expect(before).toEqual([]);
  await shot(page, "BOT-2-step2-draft");

  // 3. 把“迷上钓鱼”的可信度从“本人说”改为“亲历”。
  const fishing = sheet.locator("li").filter({ hasText: "喜欢 钓鱼" });
  await fishing.getByRole("button", { name: /可信度：本人说/ }).click();
  await page.getByRole("menuitemradio", { name: "亲历" }).click();
  await expect(fishing.getByRole("button", { name: /可信度：亲历/ })).toBeVisible();

  // 4. 删掉“女儿明年高考”这一条。
  const exam = sheet.locator("li").filter({ hasText: "女儿明年高考" });
  await exam.getByRole("button", { name: /删除/ }).click();
  await expect(sheet.getByText("女儿明年高考")).toHaveCount(0);

  // 5. 确认草稿。
  await sheet.getByRole("button", { name: "确认入图谱" }).click();
  await expect(sheet).toBeHidden();
  await expect(card.getByRole("status")).toHaveText(/已入图谱 · 2 条信息/);

  // 6. 打开老张的画像页，点开“喜欢钓鱼”这一条。
  await card.getByRole("button", { name: "老张" }).click();
  await expect(page.getByRole("heading", { name: "老张", level: 2 })).toBeVisible();
  const likes = page.locator('[data-profile-section="tags"]').filter({ hasText: "喜好与厌恶" });
  await expect(likes).toContainText("钓鱼");
  await expect(likes).toContainText("不喝酒");
  await expect(page.getByText("女儿明年高考")).toHaveCount(0);
  await expect(page.locator("[data-summary]")).toContainText("生成", { timeout: LLM_WAIT });
  await likes.getByRole("button", { name: "钓鱼" }).click();
  const citation = page.getByRole("dialog", { name: /出处/ });
  await expect(citation).toContainText(TEXT);
  await expect(citation).toContainText("记录 · 今天");
  await expect(citation.getByRole("img", { name: "可信度：亲历" })).toBeVisible();
  await shot(page, "BOT-2-step6-profile-citation");
  await page.keyboard.press("Escape");
  await shot(page, "BOT-2-step6-profile");

  // 7. 打开记录列表。
  await page.goto("/entries");
  const row = page.getByRole("button", { name: new RegExp(TEXT.slice(0, 8)) });
  await expect(row.locator("[data-entry-status]")).toHaveText("已确认");
});
