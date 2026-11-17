/** QuotaMeter level: warning once less than 10% remains, error once used up. */
export type QuotaLevel = "normal" | "low" | "exhausted";

export function quotaLevel(used: number, limit: number): QuotaLevel {
  const remaining = limit - used;
  if (remaining <= 0) return "exhausted";
  return remaining * 10 < limit ? "low" : "normal";
}
