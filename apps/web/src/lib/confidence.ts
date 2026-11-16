/**
 * 可信度 (Confidence): how reliable a piece of information is, by source.
 * Order (spec AC-16): 亲历 = 本人说 > 转述 > 推测 — 亲历 and 本人说 share a rank,
 * so on conflict neither is treated as lower than the other.
 */
export const CONFIDENCE_LEVELS = ["witnessed", "self_told", "hearsay", "inferred"] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

const LABELS: Record<Confidence, string> = {
  witnessed: "亲历",
  self_told: "本人说",
  hearsay: "转述",
  inferred: "推测",
};

const RANK: Record<Confidence, number> = {
  witnessed: 3,
  self_told: 3,
  hearsay: 2,
  inferred: 1,
};

export function confidenceLabel(level: Confidence): string {
  return LABELS[level];
}

/** > 0 when `a` is more reliable than `b`, 0 when equal rank, < 0 when less. */
export function compareConfidence(a: Confidence, b: Confidence): number {
  return RANK[a] - RANK[b];
}

/** True when `a` is not lower than `b`. */
export function isAtLeast(a: Confidence, b: Confidence): boolean {
  return compareConfidence(a, b) >= 0;
}

/** Most reliable first; equal ranks keep their input order. */
export function sortByConfidence(levels: readonly Confidence[]): Confidence[] {
  return [...levels].sort((a, b) => compareConfidence(b, a));
}
