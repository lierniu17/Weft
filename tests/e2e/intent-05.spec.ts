import { expect, test } from "@playwright/test";
import { pinClock, recordConfirmed, registerUser, say, shot, threadOf } from "./support/bot.ts";
import { E2E, LLM_WAIT, REMOTE, REMOTE_LIMITED_BASE_URL } from "./support/env.ts";

// The API behind this web app runs with DAILY_ENTRY_LIMIT=2 (tests/e2e/global-setup.ts).
test.use({ baseURL: REMOTE ? REMOTE_LIMITED_BASE_URL : `http://127.0.0.1:${E2E.limited.web}` });
test.skip(
  REMOTE && !REMOTE_LIMITED_BASE_URL,
  "remote: needs E2E_LIMITED_BASE_URL (an API with DAILY_ENTRY_LIMIT=2)",
);

const RECORD = "老张今天升职了";
const QUESTION = "老张是个什么性子？";

/**
 * Intent routing BOT-5 〔AC-7〕 the record quota is used up: a 记录 gets the quota notice in
 * place, a 提问 is still answered. (The spec's precondition is a limit of 1 with 1 used; the
 * e2e stack's limited API has DAILY_ENTRY_LIMIT=2, so 2 are used — the same situation.)
 */
test("INTENT BOT-5 录入额度用完时仍可提问", { tag: "@llm" }, async ({ page }) => {
  await pinClock(page);
  await registerUser(page);
  // 前置：录入上限用完（限额栈上限 2，当天已录入 2 条）。
  await recordConfirmed(page, "老张是个急性子。");
  await recordConfirmed(page, "张伟是我的同事。");
  await page.goto("/");

  // 1. 发送一条记录。
  await say(page, RECORD);
  const record = threadOf(page, RECORD);
  const notice = record.getByRole("status").filter({ hasText: "今日已达上限" });
  await expect(notice).toContainText("记录已用完", { timeout: LLM_WAIT });
  await expect(notice).toContainText("北京时间 0 点重置");
  await expect(record.locator("[data-draft-card]")).toHaveCount(0);
  await shot(page, "INTENT-BOT-5-step1-quota");

  // 2. 发送一个问题。
  await say(page, QUESTION);
  const answer = threadOf(page, QUESTION).getByRole("article", { name: "回答" });
  await expect(answer).toContainText("急性子", { timeout: LLM_WAIT });
  const entries = await (await page.request.get("/api/entries")).json();
  expect(entries).toHaveLength(2);
});
