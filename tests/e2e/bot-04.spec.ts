import { expect, test } from "@playwright/test";
import {
  draftCardOf,
  personId,
  pinClock,
  recordConfirmed,
  registerUser,
  shot,
  submitRecord,
} from "./support/bot.ts";

/** BOT-4 〔AC-14, AC-15, AC-22〕 update a 工作单位, then a lower-confidence 待核实. */
test("BOT-4 冲突更新与待核实", async ({ page }) => {
  await pinClock(page);
  await registerUser(page);
  // 前置：小李的画像中有社会角色“字节跳动，2023 年至今，可信度本人说”。
  await recordConfirmed(page, "小李说他 2023 年进了字节跳动，一直干到现在。");
  const xiaoli = await personId(page, "小李");
  await page.goto("/");

  // 1. 写记录“小李跟我说他上个月跳槽去了阿里”，提交。
  await submitRecord(page, "小李跟我说他上个月跳槽去了阿里");
  const first = draftCardOf(page, "小李跟我说他上个月跳槽去了阿里");
  await expect(first.getByRole("status")).toHaveText(/草稿/, { timeout: 60_000 });

  // 2. 查看草稿，确认。
  await first.getByRole("button", { name: "查看并确认" }).click();
  const sheet = page.getByRole("dialog", { name: "确认草稿" });
  await expect(sheet).toContainText("将更新：字节跳动 → 阿里巴巴");
  await shot(page, "BOT-4-step2-draft");
  await sheet.getByRole("button", { name: "确认入图谱" }).click();
  await expect(first.getByRole("status")).toHaveText(/已入图谱/);

  // 3. 打开小李的画像页。
  await page.goto(`/people/${xiaoli}`);
  const roles = page.locator('[data-profile-section="roles"]');
  await expect(roles).toContainText("阿里巴巴");
  await roles.getByRole("button", { name: /历史/ }).click();
  await expect(roles).toContainText("字节跳动");
  await expect(roles).toContainText("2023 年 – 2026 年 10 月");

  // 4. 写记录“听小王说小李又去了腾讯”，提交。
  await page.goto("/");
  await submitRecord(page, "听小王说小李又去了腾讯");
  const second = draftCardOf(page, "听小王说小李又去了腾讯");
  await expect(second.getByRole("status")).toHaveText(/草稿/, { timeout: 60_000 });

  // 5. 查看草稿，确认。
  await second.getByRole("button", { name: "查看并确认" }).click();
  await expect(sheet).toContainText("待核实");
  await expect(sheet.getByRole("button", { name: /可信度：转述/ })).toBeVisible();
  await shot(page, "BOT-4-step5-draft");
  await sheet.getByRole("button", { name: "确认入图谱" }).click();
  await expect(second.getByRole("status")).toHaveText(/已入图谱 · 1 条信息 · 1 条待核实/);

  // 6. 再次打开小李的画像页。
  await page.goto(`/people/${xiaoli}`);
  const current = page.locator('[data-profile-section="roles"]');
  const ali = current.getByRole("button", { name: /阿里巴巴/ });
  await expect(ali).toBeVisible();
  await expect(ali).not.toContainText("待核实");
  await expect(current.getByRole("button", { name: /腾讯/ })).toContainText("待核实");
  await shot(page, "BOT-4-step6-profile");
});
