import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DRAFT_OUT, DRAFT_SCHEMA, generateDraft } from "./contracts.ts";

describe("Draft types generated from apps/api/contracts/draft.schema.json", () => {
  it("projects the Draft shape and its enums", async () => {
    const ts = await generateDraft(readFileSync(DRAFT_SCHEMA, "utf8"));
    expect(ts).toContain("export interface Draft {");
    expect(ts).toContain('export type PersonMatch = "matched" | "ambiguous" | "new";');
    expect(ts).toContain(
      'export type Confidence = "witnessed" | "self_told" | "hearsay" | "inferred";',
    );
    expect(ts).toContain("export interface DraftFact {");
  });

  it("committed output is up to date with the schema (run `pnpm contracts`)", async () => {
    const ts = await generateDraft(readFileSync(DRAFT_SCHEMA, "utf8"));
    expect(readFileSync(DRAFT_OUT, "utf8")).toBe(ts);
  });
});
