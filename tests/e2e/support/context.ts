/** Helpers for the conversation context (对话上下文) BOTs. */
import { expect, type Locator, type Page } from "@playwright/test";
import { draftCardOf, say, threadOf } from "./bot.ts";
import { clarifyOf } from "./clarify.ts";
import { LLM_WAIT } from "./env.ts";

/** BOT-1 / BOT-2: two persons called 老周 in the seed graph (周涛 and 周建国). */
export const LIKES = "老周喜欢什么？";
export const WHICH = "你问的是哪位老周？";
export const TAO = "老周（周涛，大学同学）";
export const JIANGUO = "老周（周建国，老家的老邻居）";

/** BOT-3: a record that does not say who 小李 is to me. */
export const XIAOLI_DINNER = "今天和小李吃饭了";
export const XIAOLI_ASKED = "小李是你的同事还是同学？";

/** BOT-4: 「前阵子」 gives no month. */
export const LAOMA = "前阵子见了老马";
export const LAOMA_ASKED = "前阵子是什么时候？";

/** BOT-5: a question, then a follow-up read with it. */
export const WORKS = "老张在哪上班？";
export const WIFE = "那他老婆呢？";

/** The 指代确认 under a question: the same question-and-options as a 反问. */
export const confirmOf = clarifyOf;

/** The answer under a message. */
export function answerOf(thread: Locator) {
  return thread.getByRole("article", { name: "回答" });
}

/** 「接着：…」 above an answer read with the 上文. */
export function followsOf(thread: Locator) {
  return thread.locator("[data-follows-line]");
}

/** BOT-1 / BOT-2 step 1: 「老周喜欢什么？」 gets a 指代确认 with the two 老周, no answer. */
export async function askWhichLaozhou(page: Page) {
  await say(page, LIKES);
  const thread = threadOf(page, LIKES);
  const confirm = confirmOf(thread);
  await expect(confirm.reply).toContainText(WHICH, { timeout: LLM_WAIT });
  await expect(confirm.options.getByRole("button")).toHaveText([TAO, JIANGUO]);
  await expect(answerOf(thread)).toHaveCount(0);
  return { thread, confirm };
}

/** BOT-3 step 1: the draft card of 「今天和小李吃饭了」 asks who 小李 is. */
export async function dinnerWithXiaoli(page: Page) {
  await say(page, XIAOLI_DINNER);
  const card = draftCardOf(page, XIAOLI_DINNER);
  await expect(card.getByRole("status")).toHaveText(/草稿/, { timeout: LLM_WAIT });
  await expect(card.locator("[data-draft-question-line]")).toHaveText(`还差一点：${XIAOLI_ASKED}`);
  return card;
}

/** BOT-5 steps 1–2: 「老张在哪上班？」, then 「那他老婆呢？」 read with it. */
export async function askWifeAfterWork(page: Page) {
  await say(page, WORKS);
  const first = threadOf(page, WORKS);
  await expect(answerOf(first)).toContainText("字节跳动", { timeout: LLM_WAIT });
  await expect(followsOf(first)).toHaveCount(0);

  await say(page, WIFE);
  const second = threadOf(page, WIFE);
  await expect(answerOf(second)).toContainText("黄丽", { timeout: LLM_WAIT });
  await expect(followsOf(second)).toContainText(`接着：${WORKS}`);
  await expect(followsOf(second).getByRole("button", { name: "不接上文" })).toBeVisible();
  return { first, second };
}

/** Context gaps BOT-7 (spec BOT-1): nothing says who 莉莉 is; the Draft asks anyway. */
export const LILI_VIDEO = "晚上和莉莉视频聊了一个小时";
export const LILI_ASKED = "莉莉是你的什么人？";

/** Context gaps BOT-8 (spec BOT-2): a neighbour named by where she works. */
export const NEIGHBOUR = "在市一院上班的那个邻居叫什么？";
