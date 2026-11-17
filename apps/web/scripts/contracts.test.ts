import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CONTRACTS, generateContract } from "./contracts.ts";

const byName = (name: string) => {
  const c = CONTRACTS.find((x) => x.name === name);
  if (!c) throw new Error(`no contract ${name}`);
  return c;
};

describe("types generated from apps/api/contracts/*.schema.json", () => {
  it("covers draft, answer and taxonomy", () => {
    expect(CONTRACTS.map((c) => c.name)).toEqual(["Draft", "Answer", "Taxonomy"]);
  });

  it("projects the Draft shape, its ids and the two-mention pair", async () => {
    const ts = await generateContract(byName("Draft"));
    expect(ts).toContain("export interface Draft {");
    expect(ts).toContain("  persons: Persons;");
    expect(ts).toContain('export type PersonMatch = "matched" | "ambiguous" | "new";');
    expect(ts).toContain(
      'export type Confidence = "witnessed" | "self_told" | "hearsay" | "inferred";',
    );
    expect(ts).toContain("export interface DraftFact {");
    expect(ts).toContain("  valid_to?: ValidTo;");
    expect(ts).toMatch(/export type Pair = \[string, string\];/);
    expect(ts).not.toContain("unknown");
  });

  it("projects the Answer shape", async () => {
    const ts = await generateContract(byName("Answer"));
    expect(ts).toContain("export interface Answer {");
    expect(ts).toContain(
      'export type AnswerKind = "text" | "path" | "list" | "stat" | "no_answer";',
    );
    expect(ts).toContain("export interface Citation {");
    expect(ts).toContain("export interface PersonRef {");
    expect(ts).toContain("export type Pair = [PersonRef, PersonRef] | null;");
    expect(ts).toContain("  pair?: Pair;");
    expect(ts).not.toContain("unknown");
  });

  it("projects the Taxonomy payload as an array of categories", async () => {
    const ts = await generateContract(byName("Taxonomy"));
    expect(ts).toContain("export type Taxonomy = TaxonomyCategory[];");
    expect(ts).toContain("export interface TaxonomySubtype {");
  });

  it.each(CONTRACTS.map((c) => [c.name, c] as const))(
    "committed %s output is up to date with the schema (run `pnpm contracts`)",
    async (_name, c) => {
      const ts = await generateContract(c);
      expect(readFileSync(c.out, "utf8").replace(/\r\n/g, "\n")).toBe(ts);
    },
  );
});
