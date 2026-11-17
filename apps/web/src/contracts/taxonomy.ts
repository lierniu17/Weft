/**
 * 关系类型词表 (Relationship Type vocabulary) as served by the 词表 endpoint: five categories
 * (大类) in fixed order, each with built-in subtypes (小类), the user's custom ones
 * (`custom: true`) and 「其他」 last.
 *
 * The contract is owned by the API: apps/api/contracts/taxonomy.schema.json
 * (weft.domain.taxonomy_contract), projected into `taxonomy.gen.ts` by `pnpm contracts`.
 */
export type { Taxonomy, TaxonomyCategory, TaxonomySubtype } from "./taxonomy.gen.ts";
