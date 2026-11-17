import { expect, test } from "@playwright/test";
import {
  draftCardOf,
  pinClock,
  registerUser,
  replayedOr,
  shot,
  submitRecord,
} from "./support/bot.ts";
import { LLM_WAIT, REMOTE } from "./support/env.ts";

const TEXT = "今天和老张吃饭，他说他女儿明年高考，他最近迷上了钓鱼，不过他不喝酒。";
const DAUGHTER = "老张的女儿"; // 称谓人物 (Descriptor Person)

/** BOT-2 〔AC-6, AC-9, AC-10, AC-11, AC-21, AC-25〕 record → review → confirm → profile. */
test("BOT-2 写记录、改草稿、确认、看画像与出处", { tag: "@llm" }, async ({ page }) => {
  await pinClock(page);
  await registerUser(page);
  await page.goto("/");

  // 1. 写记录，提交。
  await submitRecord(page, TEXT);
  const card = draftCardOf(page, TEXT);

  // 2. 等待草稿进入待确认。
  // Replayed: exactly the spec's 2 persons and 4 items. A real model may add an item the
  // spec leaves open (e.g. 我 与 老张); every spec item must still be there, and step 5
  // checks that exactly the two deleted ones are missing.
  const status = card.getByRole("status");
  await expect(status).toHaveText(
    replayedOr(/^草稿 · 2 个人物 · 4 条信息$/, /^草稿 · \d+ 个人物 · \d+ 条信息$/),
    { timeout: LLM_WAIT },
  );
  const itemCount = Number((await status.textContent())?.match(/(\d+) 条信息/)?.[1]);
  await expect(page.locator("[data-draft-card]")).toHaveCount(1); // in place, not appended
  await card.getByRole("button", { name: "查看并确认" }).click();
  const sheet = page.getByRole("dialog", { name: "确认草稿" });
  await expect(sheet).toBeVisible();
  const newPerson = (name: string) =>
    sheet.locator('[data-person-match="new"]').filter({
      has: page.getByText(name, { exact: true }),
    });
  await expect(newPerson("老张")).toHaveCount(1);
  await expect(newPerson(DAUGHTER)).toHaveCount(1);

  const facts = sheet.getByRole("region", { name: "信息" });
  const relationships = sheet.getByRole("region", { name: "关系变化" });
  const fishing = facts.locator("li").filter({ hasText: "老张 · 喜欢 钓鱼" });
  const drinking = facts.locator("li").filter({ hasText: "老张 · 不喜欢 喝酒" });
  const exam = facts.locator("li").filter({
    hasText: replayedOr<string | RegExp>(`${DAUGHTER} · 经历 明年高考`, /的女儿 · 经历 .*高考/),
  });
  // 老张 是 老张的女儿 的 父母 (or the same read the other way round: 女儿 是 老张 的 子女)
  const kin = relationships.locator("li").filter({ hasText: DAUGHTER });
  for (const item of [fishing, drinking, exam]) await expect(item).toHaveCount(1);
  await expect(kin).toHaveCount(1);
  await expect(
    kin.getByRole("button", {
      name: replayedOr<string | RegExp>("修改关系类型「亲属 · 父母」", /亲属 · (父母|子女)/),
    }),
  ).toBeVisible();
  for (const item of [fishing, drinking, exam, kin]) {
    await expect(item.getByRole("button", { name: /^可信度：/ })).toBeVisible();
  }
  await expect(sheet.getByRole("button", { name: /可信度：/ })).toHaveCount(itemCount);
  if (!REMOTE) {
    await expect(sheet.getByRole("button", { name: /可信度：本人说/ })).toHaveCount(4);
  }
  // 确认前人物列表里没有老张（也没有老张的女儿）
  const before = await (await page.request.get("/api/persons?q=老张")).json();
  expect(before).toEqual([]);
  await shot(page, "BOT-2-step2-draft");

  // 3. 把“迷上钓鱼”的可信度从“本人说”改为“亲历”。
  await fishing.getByRole("button", { name: /可信度：本人说/ }).click();
  await page.getByRole("menuitemradio", { name: "亲历" }).click();
  await expect(fishing.getByRole("button", { name: /可信度：亲历/ })).toBeVisible();

  // 4. 删掉“老张的女儿 · 明年高考”这一条，以及老张与老张的女儿之间的关系这一条。
  await exam.getByRole("button", { name: /删除/ }).click();
  await expect(exam).toHaveCount(0);
  await kin.getByRole("button", { name: /删除/ }).click();
  await expect(kin).toHaveCount(0);

  // 5. 确认草稿。
  await sheet.getByRole("button", { name: "确认入图谱" }).click();
  await expect(sheet).toBeHidden();
  await expect(status).toHaveText(new RegExp(`已入图谱 · ${itemCount - 2} 条信息`));
  // 删掉的两条不写入，老张的女儿因此不会出现在人物列表里。
  await expect(card.getByRole("button", { name: DAUGHTER })).toHaveCount(0);
  const people = (await (await page.request.get("/api/persons")).json()) as { name: string }[];
  expect(people.map((p) => p.name)).toContain("老张");
  expect(people.map((p) => p.name)).not.toContain(DAUGHTER);

  // 6. 打开老张的画像页，点开“喜欢钓鱼”这一条。
  await card.getByRole("button", { name: "老张", exact: true }).click();
  await expect(page.getByRole("heading", { name: "老张", level: 2 })).toBeVisible();
  const likes = page.locator('[data-profile-section="tags"]').filter({ hasText: "喜好与厌恶" });
  await expect(likes).toContainText("钓鱼");
  await expect(likes).toContainText("不喝酒");
  await expect(page.getByText("高考")).toHaveCount(0);
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
