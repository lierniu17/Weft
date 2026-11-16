/**
 * 关系类型词表 (Relationship Type vocabulary) as served by the 词表 endpoint:
 * five categories (大类), each with built-in subtypes (小类) plus the user's custom ones.
 * Mirrors apps/api weft.domain.taxonomy until batch 1 publishes a JSON Schema for it.
 */
import type { Category } from "./draft.ts";

export type TaxonomySubtype = {
  name: string;
  /** User-defined (自定义小类): visible only to this user. */
  custom?: boolean;
};

export type TaxonomyCategory = {
  category: Category;
  subtypes: TaxonomySubtype[];
};

export type Taxonomy = TaxonomyCategory[];
