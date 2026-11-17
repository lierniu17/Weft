import { expect, test } from "@playwright/test";
import { pinClock, recordConfirmed, registerUser, shot } from "./support/bot.ts";
import { E2E } from "./support/env.ts";

// The API behind this web app runs with DAILY_ENTRY_LIMIT=2 (tests/e2e/global-setup.ts).
test.use({ baseURL: `http://127.0.0.1:${E2E.limited.web}` });

/** BOT-10 〔AC-40〕 the third Entry of the day is refused, with the reset time. */
test("BOT-10 录入额度用完", async ({ page }) => {
  await pinClock(page);
  await registerUser(page);
  // 前置：把录入上限配置为 2；当天已提交 2 条记录。
  await recordConfirmed(page, "老张是个急性子。");
  await recordConfirmed(page, "张伟是我的同事。");
  await page.goto("/");

  // 1. 提交第 3 条记录。
  const banner = page.getByRole("status").filter({ hasText: "今日已达上限" });
  await expect(banner).toContainText("北京时间 0 点重置");
  const box = page.getByRole("textbox", { name: "记录内容" });
  await expect(box).toBeDisabled();
  await expect(page.getByRole("button", { name: "发送" })).toBeDisabled();
  await shot(page, "BOT-10-step1-quota");
  // The server refuses it too (a stale page could still try).
  const refused = await page.request.post("/api/entries", { data: { text: "第三条记录" } });
  expect(refused.status()).toBe(429);
  expect((await refused.json()).message).toContain("今日已达上限");
  // 没有新的记录生成
  const entries = await (await page.request.get("/api/entries")).json();
  expect(entries).toHaveLength(2);
});
