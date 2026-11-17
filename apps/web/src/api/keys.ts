/**
 * Cache keys, one place. Everything a confirmation or an edit can change lives under
 * `graphScoped` prefixes so `invalidateGraph` refreshes it in one call.
 */
import type { QueryClient } from "@tanstack/react-query";

export const keys = {
  me: ["me"] as const,
  usage: ["usage"] as const,
  taxonomy: ["taxonomy"] as const,
  entries: ["entries"] as const,
  entry: (id: string) => ["entry", id] as const,
  draft: (id: string) => ["draft", id] as const,
  persons: (q: string) => ["persons", q] as const,
  person: (id: string) => ["person", id] as const,
  deletionImpact: (id: string) => ["deletion-impact", id] as const,
  pair: (a: string, b: string) => ["pair", a, b] as const,
  localGraph: (id: string, hops: number) => ["graph", "local", id, hops] as const,
  panorama: (filter: string) => ["graph", "panorama", filter] as const,
};

const GRAPH_SCOPED = new Set([
  "entries",
  "entry",
  "persons",
  "person",
  "pair",
  "graph",
  "deletion-impact",
]);

/** After the graph changed (confirm, manual edit, delete): refetch everything derived from it. */
export function invalidateGraph(qc: QueryClient) {
  return qc.invalidateQueries({
    predicate: (q) => GRAPH_SCOPED.has(String(q.queryKey[0])),
  });
}
