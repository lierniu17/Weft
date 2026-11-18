/** BOT helpers: users, invites, preconditions through the real API, clock, screenshots. */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { type APIRequestContext, expect, type Page } from "@playwright/test";
import {
  LLM_WAIT,
  REMOTE,
  ROOT,
  remoteCli,
  SCREENSHOTS,
  STATE_DIR,
  serverEnv,
  TODAY,
  uvArgs,
} from "./env.ts";

let userSeq = 0;

export function nextInvite(): string {
  const file = resolve(STATE_DIR, "invites.json");
  const state = JSON.parse(readFileSync(file, "utf8")) as { codes: string[]; next: number };
  const code = state.codes[state.next];
  if (!code) throw new Error("invite pool exhausted");
  writeFileSync(file, JSON.stringify({ ...state, next: state.next + 1 }));
  return code;
}

export function uniqueLogin(prefix: string): string {
  userSeq += 1;
  return `${prefix}_${Date.now().toString(36)}_${userSeq}`;
}

export const PASSWORD = "weft-e2e-pass";

/**
 * Pins the browser clock to the e2e day (time keeps running from 10:00). Remote runs keep
 * the real clock: the deployed API is not pinned, and the two must agree on "today".
 */
export async function pinClock(page: Page) {
  if (!REMOTE) await page.clock.install({ time: TODAY });
}

/** TODAY in Beijing, moved by whole days: { y, m, d } (m is 1-based). */
export function beijingDay(shiftDays = 0) {
  const t = new Date(TODAY.getTime() + 8 * 3_600_000 + shiftDays * 86_400_000);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/** The month before TODAY's (Beijing): { y, m }. */
export function lastMonth() {
  const { y, m } = beijingDay();
  return m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
}

export async function shot(page: Page, name: string) {
  await page.waitForTimeout(300); // let sheets finish sliding in
  await page.screenshot({ path: resolve(SCREENSHOTS, `${name}.png`), fullPage: false });
}

/** Registers through the API; the session cookie lands in the page's context. */
export async function registerUser(page: Page, displayName = "小明", prefix = "bot") {
  const username = uniqueLogin(prefix);
  const r = await page.request.post("/api/auth/register", {
    data: { invite_code: nextInvite(), username, password: PASSWORD, display_name: displayName },
  });
  expect(r.status(), await r.text()).toBe(201);
  return { username, ...(await r.json()) } as {
    username: string;
    self_person_id: string;
  };
}

type DraftOut = {
  id: string;
  status: string;
  content: {
    persons: {
      id: string;
      mention: string;
      match: string;
      candidates?: { person_id: string; name: string }[];
    }[];
  } | null;
};

export async function waitDraft(api: APIRequestContext, id: string, status = "pending") {
  let draft: DraftOut | undefined;
  await expect
    .poll(
      async () => {
        draft = (await (await api.get(`/api/drafts/${id}`)).json()) as DraftOut;
        return draft.status;
      },
      { timeout: LLM_WAIT },
    )
    .toBe(status);
  return draft as DraftOut;
}

/** Submits an Entry, waits for its draft and confirms it (a precondition, not a BOT step). */
export async function recordConfirmed(
  page: Page,
  text: string,
  options: { occurredOn?: string; choose?: Record<string, string> } = {},
) {
  const api = page.request;
  const r = await api.post("/api/entries", {
    data: { text, ...(options.occurredOn ? { occurred_on: options.occurredOn } : {}) },
  });
  expect(r.status(), await r.text()).toBe(201);
  const submitted = await r.json();
  const draft = await waitDraft(api, submitted.draft.id);
  if (options.choose && draft.content) {
    for (const p of draft.content.persons) {
      const pick = options.choose[p.mention];
      const c = p.candidates?.find((x) => x.name === pick);
      if (c) Object.assign(p, { match: "matched", person_id: c.person_id, name: c.name });
    }
    expect(
      (await api.put(`/api/drafts/${draft.id}`, { data: { content: draft.content } })).ok(),
    ).toBe(true);
  }
  const confirmed = await api.post(`/api/drafts/${draft.id}/confirm`);
  expect(confirmed.status(), await confirmed.text()).toBe(200);
  return { entryId: submitted.entry.id as string, draftId: draft.id };
}

export async function personId(page: Page, name: string): Promise<string> {
  const list = (await (
    await page.request.get(`/api/persons?q=${encodeURIComponent(name)}`)
  ).json()) as {
    id: string;
    name: string;
    aliases: string[];
  }[];
  const p = list.find((x) => x.name === name || x.aliases.includes(name));
  if (!p) throw new Error(`no person ${name}`);
  return p.id;
}

/**
 * Writes the seed graph into LOGIN's graph (remote: the admin CLI inside the environment).
 * `size` grows it with generated persons to that many (graph performance, e.g. 300).
 */
export function seedGraph(login: string, size?: number) {
  const sized = size ? ["--size", String(size)] : [];
  if (REMOTE) {
    const [cmd, args] = remoteCli("seed", "--user", login, ...sized);
    execFileSync(cmd, args, { cwd: ROOT, stdio: "pipe" });
    return;
  }
  execFileSync("uv", uvArgs("seed", login, ...sized), {
    cwd: ROOT,
    env: serverEnv(),
    stdio: "pipe",
  });
}

/** No horizontal scrollbar at the current viewport (AC-35, AC-UI-7). */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => {
    const el = document.documentElement;
    return el.scrollWidth - el.clientWidth;
  });
  expect(overflow, `page ${page.url()} scrolls horizontally`).toBeLessThanOrEqual(0);
}

/**
 * Composer: say something — a record, a question, anything (intent routing: there is no
 * 记录 / 提问 switch and no date; the message itself says what it is and when).
 */
export async function say(page: Page, text: string) {
  await page.getByRole("textbox", { name: "消息内容" }).fill(text);
  await page.getByRole("button", { name: "发送" }).click();
}

/** The chat thread of the message with this text (bubble, 纠正 row, draft / answer / reply). */
export function threadOf(page: Page, text: string) {
  return page.locator("[data-message-thread]").filter({
    has: page.locator("[data-bubble]", { hasText: text }),
  });
}

/** The draft card of the message with this text. */
export function draftCardOf(page: Page, text: string) {
  return threadOf(page, text).getByRole("region", { name: "草稿" });
}

/** Today's used quotas, from the API. */
export async function usage(page: Page): Promise<{ entry: number; ask: number }> {
  const u = await (await page.request.get("/api/usage")).json();
  return { entry: u.entry.used, ask: u.ask.used };
}

/**
 * An expectation on model output: exact against the replayed fixtures (local), tolerant
 * of wording against real models (remote, stage). Only for wording the spec leaves open
 * (阿里 vs 阿里巴巴); never to hide a behaviour difference.
 */
export function replayedOr<T>(replayed: T, realModel: T): T {
  return REMOTE ? realModel : replayed;
}
