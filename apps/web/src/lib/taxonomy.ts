import type { Category } from "../contracts/draft.ts";
import type { Taxonomy } from "../contracts/taxonomy.ts";

/** apps/api CUSTOM_SUBTYPE_MAX_LEN */
export const SUBTYPE_MAX_LEN = 20;

export type SubtypeValidation = { ok: true; name: string } | { ok: false; error: string };

/** Validates a new custom subtype (自定义小类) under `category`. */
export function validateSubtype(
  taxonomy: Taxonomy,
  category: Category,
  raw: string,
): SubtypeValidation {
  const name = raw.trim();
  if (!name) return { ok: false, error: "请输入小类名称" };
  if (Array.from(name).length > SUBTYPE_MAX_LEN) {
    return { ok: false, error: `最多 ${SUBTYPE_MAX_LEN} 个字` };
  }
  const group = taxonomy.find((g) => g.category === category);
  if (group?.subtypes.some((s) => s.name === name)) {
    return { ok: false, error: `「${name}」已存在` };
  }
  return { ok: true, name };
}
