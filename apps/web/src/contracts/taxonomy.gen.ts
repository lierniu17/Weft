/* GENERATED from apps/api/contracts/taxonomy.schema.json by scripts/contracts.ts — do not edit; run `pnpm contracts`. */

export type Category = "kin" | "romantic" | "social" | "interest" | "hostile";
export type Name = string;
/**
 * User-defined (自定义小类): visible only to this user
 */
export type Custom = boolean;
export type Subtypes = TaxonomySubtype[];
/**
 * The whole vocabulary visible to one user.
 */
export type Taxonomy = TaxonomyCategory[];

export interface TaxonomyCategory {
  category: Category;
  subtypes: Subtypes;
}
export interface TaxonomySubtype {
  name: Name;
  custom?: Custom;
}
