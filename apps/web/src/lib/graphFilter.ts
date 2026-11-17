/** 全景图筛选 (GraphFilterSheet) state and its query-string form. */
import type { Category, ClosenessLevel } from "../contracts/draft.ts";
import { CATEGORIES, FEELING_LEVELS } from "./labels.ts";

export type GraphFilter = {
  categories: Category[];
  subtypes: string[];
  /** Show only people at least this close (「亲近及以上」); null = 全部亲密度. */
  minCloseness: ClosenessLevel | null;
};

export const EMPTY_FILTER: GraphFilter = { categories: [], subtypes: [], minCloseness: null };

const CLOSENESS: readonly string[] = FEELING_LEVELS.closeness.map(([v]) => v);

export function isEmptyFilter(f: GraphFilter): boolean {
  return !f.categories.length && !f.subtypes.length && !f.minCloseness;
}

export function serializeGraphFilter(f: GraphFilter): string {
  const params = new URLSearchParams();
  if (f.categories.length) {
    params.set("category", CATEGORIES.filter((c) => f.categories.includes(c)).join(","));
  }
  if (f.subtypes.length) params.set("subtype", f.subtypes.join(","));
  if (f.minCloseness) params.set("closeness", f.minCloseness);
  return params.toString();
}

export function parseGraphFilter(query: string): GraphFilter {
  const params = new URLSearchParams(query);
  const list = (key: string) => (params.get(key) ?? "").split(",").filter(Boolean);
  const closeness = params.get("closeness");
  return {
    categories: list("category").filter((c): c is Category => CATEGORIES.includes(c as Category)),
    subtypes: list("subtype"),
    minCloseness: closeness && CLOSENESS.includes(closeness) ? (closeness as ClosenessLevel) : null,
  };
}
