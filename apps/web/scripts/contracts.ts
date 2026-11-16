/**
 * apps/api/contracts/*.schema.json → TypeScript types.
 *
 * The API owns the contract; the web app only consumes it. This script projects the
 * Draft JSON Schema into src/contracts/draft.gen.ts.
 *
 * Modes:  --write  regenerate
 *         --check  exit 1 if the committed file is stale (the unit test asserts the same)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compile, type JSONSchema } from "json-schema-to-typescript";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DRAFT_SCHEMA = resolve(WEB, "../api/contracts/draft.schema.json");
export const DRAFT_OUT = resolve(WEB, "src/contracts/draft.gen.ts");

const BANNER = `/* GENERATED from apps/api/contracts/draft.schema.json by scripts/contracts.ts — do not edit; run \`pnpm contracts\`. */`;

export async function generateDraft(schemaJson: string): Promise<string> {
  const schema = JSON.parse(schemaJson) as JSONSchema;
  const ts = await compile(schema, "Draft", {
    bannerComment: BANNER,
    additionalProperties: false,
    unreachableDefinitions: true,
    style: { printWidth: 100, singleQuote: false, trailingComma: "all" },
  });
  return ts.replace(/\r\n/g, "\n");
}

async function main() {
  const mode = process.argv[2];
  const ts = await generateDraft(readFileSync(DRAFT_SCHEMA, "utf8"));
  if (mode === "--write") {
    writeFileSync(DRAFT_OUT, ts);
    console.log("contracts written");
  } else if (mode === "--check") {
    if (readFileSync(DRAFT_OUT, "utf8") !== ts) {
      console.error("contracts are stale — run `pnpm contracts`");
      process.exit(1);
    }
    console.log("contracts up to date");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
