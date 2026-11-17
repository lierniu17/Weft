import { expect, test } from "@playwright/test";
import {
  beijingDay,
  draftCardOf,
  personId,
  pinClock,
  registerUser,
  replayedOr,
  shot,
  submitRecord,
} from "./support/bot.ts";
import { LLM_WAIT } from "./support/env.ts";

const TEXT = "读大学时在社团认识了小李";

/** BOT-12 〔AC-7〕 a year-precision 发生日期; future days can't be picked. */
test("BOT-12 只精确到年的补记与未来日期不可选", { tag: "@llm" }, async ({ page }) => {
  await pinClock(page);
  await registerUser(page);
  await page.goto("/");

  // 1. 写记录，把发生日期设为只精确到年的 2015 年，提交并确认。
  await page.getByRole("button", { name: "发生日期：今天" }).click();
  const picker = page.getByRole("dialog", { name: "发生日期" });
  await picker.getByRole("radio", { name: "年" }).click();
  await picker.getByRole("button", { name: "2015 年" }).click();
  await picker.getByRole("button", { name: "确定" }).click();
  await expect(page.getByRole("button", { name: "发生日期：2015 年" })).toBeVisible();
  await submitRecord(page, TEXT);
  const card = draftCardOf(page, TEXT);
  await expect(page.locator("[data-entry-thread]").filter({ hasText: TEXT })).toContainText(
    "记录 · 2015 年",
  );
  await expect(card.getByRole("status")).toHaveText(/草稿/, { timeout: LLM_WAIT });
  await card.getByRole("button", { name: "查看并确认" }).click();
  const sheet = page.getByRole("dialog", { name: "确认草稿" });
  await expect(sheet).toContainText("2015 年");
  await sheet.getByRole("button", { name: "确认入图谱" }).click();
  await expect(card.getByRole("status")).toHaveText(/已入图谱/);
  // 下一条记录的日期回到今天
  await expect(page.getByRole("button", { name: "发生日期：今天" })).toBeVisible();

  // 2. 打开本人与小李的关系页。
  await page.goto(`/people/${await personId(page, "小李")}`);
  await page.getByRole("button", { name: /我和他/ }).click();
  const overview = page.locator("[data-relationship-overview]");
  await expect(overview.getByRole("heading", { name: "我和他" })).toBeVisible();
  await expect(overview.locator("div").filter({ hasText: /^认识时间/ })).toContainText("2015 年");
  await expect(overview.locator("div").filter({ hasText: /^认识途径/ })).toContainText(
    replayedOr<string | RegExp>("大学社团", /社团/), // real models may drop 大学
  );
  await shot(page, "BOT-12-step2-relationship");

  // 3. 再写一条记录时，尝试把发生日期设为明天。
  await page.goto("/");
  await page.getByRole("button", { name: "发生日期：今天" }).click();
  await expect(picker.getByRole("radio", { name: "日" })).toBeChecked();
  // Local: today 2026-11-16, tomorrow 11-17. Remote runs on the real date; tomorrow is only
  // in this month's grid when it is in the same month.
  const label = ({ y, m, d }: { y: number; m: number; d: number }) => `${y} 年 ${m} 月 ${d} 日`;
  const [today, tomorrow] = [beijingDay(), beijingDay(1)];
  if (tomorrow.m === today.m)
    await expect(picker.getByRole("button", { name: label(tomorrow) })).toBeDisabled();
  await expect(picker.getByRole("button", { name: label(today) })).toBeEnabled();
  await expect(picker.getByRole("button", { name: "下个月" })).toBeDisabled();
});
