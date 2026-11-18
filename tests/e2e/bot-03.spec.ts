import { expect, test } from "@playwright/test";
import { draftCardOf, pinClock, recordConfirmed, registerUser, say, shot } from "./support/bot.ts";
import { LLM_WAIT } from "./support/env.ts";

/** BOT-3 〔AC-12, AC-13, AC-20〕 需选择 → choose 张伟 → 老张 is learned as an alias. */
test("BOT-3 需选择候选人与别名", { tag: "@llm" }, async ({ page }) => {
  await pinClock(page);
  await registerUser(page);
  // 前置：图谱里已有“张伟（同事）”和“张强（邻居）”。
  await recordConfirmed(page, "张伟是我的同事。");
  await recordConfirmed(page, "张强是我家邻居。");
  await page.goto("/");

  // 1. 写记录“老张今天升职了”，提交。
  await say(page, "老张今天升职了");
  const card = draftCardOf(page, "老张今天升职了");
  await expect(card.getByRole("status")).toHaveText(/草稿/, { timeout: LLM_WAIT });
  await expect(card).toContainText("老张 是谁？需选择");

  // 2. 在草稿里看到老张为需选择，先不选，尝试确认。
  await card.getByRole("button", { name: "查看并确认" }).click();
  const sheet = page.getByRole("dialog", { name: "确认草稿" });
  const ambiguous = sheet.locator('[data-person-match="ambiguous"]');
  await expect(ambiguous).toContainText("老张 是谁？");
  await expect(ambiguous.getByRole("button", { name: "张伟（同事）" })).toBeVisible();
  await expect(ambiguous.getByRole("button", { name: "张强（邻居）" })).toBeVisible();
  const confirm = sheet.getByRole("button", { name: "确认入图谱" });
  await expect(confirm).toBeDisabled();
  await expect(sheet.getByText("还有 1 个人物需要先选择")).toBeVisible();
  await shot(page, "BOT-3-step2-candidates");

  // 3. 选择张伟，确认。
  await ambiguous.getByRole("button", { name: "张伟（同事）" }).click();
  await expect(
    sheet.locator('[data-person-match="matched"]').filter({ hasText: "老张 是 张伟" }),
  ).toBeVisible();
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(sheet).toBeHidden();
  await expect(card.getByRole("status")).toHaveText(/已入图谱/);
  await expect(card).toContainText("学到别名：老张 = 张伟");

  // 4. 再写一条记录“老张请大家喝奶茶”，提交。
  await say(page, "老张请大家喝奶茶");
  const second = draftCardOf(page, "老张请大家喝奶茶");
  await expect(second.getByRole("status")).toHaveText(/草稿/, { timeout: LLM_WAIT });
  await expect(second).toContainText("老张 是 张伟");
  await second.getByRole("button", { name: "查看并确认" }).click();
  await expect(
    sheet.locator('[data-person-match="matched"]').filter({ hasText: "老张 是 张伟" }),
  ).toContainText("已匹配");
  await shot(page, "BOT-3-step4-matched");
  await sheet.getByRole("button", { name: "确认入图谱" }).click();
  await expect(second.getByRole("status")).toHaveText(/已入图谱/);

  // 5. 在人物列表中查找“老张”。
  await page
    .getByRole("navigation", { name: "主导航" })
    .getByRole("button", { name: "人物" })
    .click();
  await page
    .getByRole("searchbox", { name: "搜索姓名或别名" })
    .or(page.getByLabel("搜索姓名或别名"))
    .first()
    .fill("老张");
  const results = page.getByRole("region", { name: "搜索结果" });
  await expect(results.locator("[data-list-item]")).toHaveCount(1);
  await expect(results).toContainText("张伟（老张）");
});
