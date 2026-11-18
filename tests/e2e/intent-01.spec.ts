import { expect, test } from "@playwright/test";
import { draftCardOf, pinClock, registerUser, say, shot, threadOf } from "./support/bot.ts";
import { LLM_WAIT } from "./support/env.ts";

const TEXT = "2015 年读大学时在社团认识了小李";

/**
 * Intent routing BOT-1 〔AC-1, AC-3, AC-8, AC-9〕 just say it: no switch, no date; the year
 * in the message is the 发生日期; 「发生在」 in the review moves it.
 */
test("INTENT BOT-1 直接说话记录，发生日期来自原话并可修改", { tag: "@llm" }, async ({ page }) => {
  await pinClock(page);
  await registerUser(page);
  await page.goto("/");

  // 1. 输入“2015 年读大学时在社团认识了小李”并发送。
  const composer = page.locator("[data-composer]");
  await expect(composer.getByRole("radio")).toHaveCount(0);
  await expect(composer.getByRole("button", { name: /发生日期/ })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "消息内容" })).toHaveAttribute(
    "placeholder",
    "记点什么，或问点什么……",
  );
  await say(page, TEXT);
  const thread = threadOf(page, TEXT);
  const card = draftCardOf(page, TEXT);
  await expect(card.getByRole("status")).toHaveText(/草稿/, { timeout: LLM_WAIT });
  await expect(thread).toContainText("记录 · 2015 年");
  await expect(thread.getByRole("button", { name: "改为提问" })).toBeVisible();
  await shot(page, "INTENT-BOT-1-step1-draft");

  // 2. 打开确认草稿。
  await card.getByRole("button", { name: "查看并确认" }).click();
  const sheet = page.getByRole("dialog", { name: "确认草稿" });
  const occurred = sheet.getByRole("button", { name: "发生在：2015 年" });
  await expect(occurred).toBeVisible();
  await shot(page, "INTENT-BOT-1-step2-review");

  // 3. 把“发生在”改为 2016 年。
  await occurred.click();
  const picker = page.getByRole("dialog", { name: "发生日期" });
  await expect(picker.getByRole("radio", { name: "年" })).toBeChecked();
  await picker.getByRole("button", { name: "2016 年" }).click();
  await picker.getByRole("button", { name: "确定" }).click();
  await expect(sheet.getByRole("button", { name: "发生在：2016 年" })).toBeVisible();
  await expect(sheet.getByRole("status").filter({ hasText: "请检查一遍" })).toBeVisible();
  await expect(thread).toContainText("记录 · 2016 年");

  // 4. 确认。
  await sheet.getByRole("button", { name: "确认入图谱" }).click();
  await expect(sheet).toBeHidden();
  await expect(card.getByRole("status")).toHaveText(/已入图谱/);
  // a confirmed 记录 can no longer be asked instead
  await expect(thread.getByRole("button", { name: "改为提问" })).toHaveCount(0);
  const entries = (await (await page.request.get("/api/entries")).json()) as {
    text: string;
    occurred_on: string;
  }[];
  expect(entries.find((e) => e.text === TEXT)?.occurred_on).toBe("2016");
});
