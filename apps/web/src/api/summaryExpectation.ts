/**
 * Which people should have a 综合描述 on the way. Summaries are regenerated in the background
 * after a draft is confirmed or a profile is edited; only in the minute after such a change is
 * a missing summary "pending" (skeleton + polling). Otherwise a missing summary simply isn't
 * shown — seeded people, or a summary that failed to generate, must not show a skeleton on
 * every visit.
 */
const WINDOW_MS = 60_000;

let anyUntil = 0;
const until = new Map<string, number>();

/** A draft was confirmed: any person may get a new summary (new people's ids aren't known yet). */
export function expectSummariesForAll(now = Date.now()) {
  anyUntil = now + WINDOW_MS;
}

/** One person's profile was edited. */
export function expectSummary(personId: string, now = Date.now()) {
  until.set(personId, now + WINDOW_MS);
}

export function summaryExpected(personId: string, now = Date.now()): boolean {
  return now < anyUntil || now < (until.get(personId) ?? 0);
}

/** Tests only. */
export function resetSummaryExpectations() {
  anyUntil = 0;
  until.clear();
}
