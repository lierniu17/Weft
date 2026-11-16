/**
 * apps/api/contracts/*.schema.json → TypeScript types.
 *
 * The API owns the contracts; the web app only consumes them. This script projects each
 * JSON Schema into src/contracts/<name>.gen.ts (draft, answer, taxonomy).
 *
 * Modes:  --write  regenerate
 *         --check  exit 1 if any committed file is stale (the unit test asserts the same)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compile, type JSONSchema } from "json-schema-to-typescript";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export type Contract = {
  /** Root type name in the generated file. */
  name: string;
  schema: string;
  out: string;
};

function contract(name: string, file: string): Contract {
  return {
    name,
    schema: resolve(WEB, `../api/contracts/${file}.schema.json`),
    out: resolve(WEB, `src/contracts/${file}.gen.ts`),
  };
}

export const CONTRACTS: readonly Contract[] = [
  contract("Draft", "draft"),
  contract("Answer", "answer"),
  contract("Taxonomy", "taxonomy"),
];

const banner = (file: string) =>
  `/* GENERATED from apps/api/contracts/${file} by scripts/contracts.ts — do not edit; run \`pnpm contracts\`. */`;

export async function generate(name: string, schemaFile: string, schemaJson: string) {
  const schema = JSON.parse(schemaJson) as JSONSchema;
  const ts = await compile(schema, name, {
    bannerComment: banner(schemaFile),
    additionalProperties: false,
    unreachableDefinitions: true,
    style: { printWidth: 100, singleQuote: false, trailingComma: "all" },
  });
  return ts.replace(/\r\n/g, "\n");
}

/** Generated TypeScript for one contract, read from its schema file. */
export function generateContract(c: Contract): Promise<string> {
  const file = c.schema.split(/[\\/]/).pop() ?? c.schema;
  return generate(c.name, file, readFileSync(c.schema, "utf8"));
}

const normalize = (text: string) => text.replace(/\r\n/g, "\n");

async function main() {
  const mode = process.argv[2];
  const stale: string[] = [];
  for (const c of CONTRACTS) {
    const ts = await generateContract(c);
    if (mode === "--write") writeFileSync(c.out, ts);
    else if (mode === "--check" && normalize(readFileSync(c.out, "utf8")) !== ts) stale.push(c.out);
  }
  if (mode === "--write") console.log("contracts written");
  if (mode === "--check") {
    if (stale.length) {
      console.error(`contracts are stale — run \`pnpm contracts\`:\n  ${stale.join("\n  ")}`);
      process.exit(1);
    }
    console.log("contracts up to date");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
