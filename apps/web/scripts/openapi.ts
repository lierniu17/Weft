/**
 * The API's OpenAPI document → TypeScript types for the page-integration layer (src/api/).
 *
 * The API owns the HTTP contract. This script asks apps/api (read-only, via `uv run`) for
 * its OpenAPI document, keeps a snapshot in src/api/openapi.json and projects it into
 * src/api/schema.gen.ts with openapi-typescript.
 *
 * Modes:  --write  dump + regenerate
 *         --check  regenerate from the committed snapshot; exit 1 if schema.gen.ts is stale
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import openapiTS, { astToString } from "openapi-typescript";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const API = resolve(WEB, "../api");
const SNAPSHOT = resolve(WEB, "src/api/openapi.json");
const OUT = resolve(WEB, "src/api/schema.gen.ts");

const BANNER =
  "/* GENERATED from the API's OpenAPI document by scripts/openapi.ts — do not edit; run `pnpm openapi`. */\n";

function dump(): string {
  const code =
    "import json,sys;from weft.main import create_app;" +
    "sys.stdout.reconfigure(encoding='utf-8');" +
    "print(json.dumps(create_app().openapi(),ensure_ascii=False,indent=1,sort_keys=True))";
  return execFileSync("uv", ["run", "--quiet", "python", "-c", code], {
    cwd: API,
    encoding: "utf8",
    // The document never contains secrets, but keep the real .env keys out of the child anyway.
    env: { ...process.env, DEEPSEEK_API_KEY: "", DASHSCOPE_API_KEY: "" },
  });
}

async function generate(json: string): Promise<string> {
  const ast = await openapiTS(JSON.parse(json));
  return (BANNER + astToString(ast)).replace(/\r\n/g, "\n");
}

const mode = process.argv[2];
if (mode === "--write") {
  const json = dump().replace(/\r\n/g, "\n");
  writeFileSync(SNAPSHOT, json);
  writeFileSync(OUT, await generate(json));
  console.log("wrote src/api/openapi.json and src/api/schema.gen.ts");
} else if (mode === "--check") {
  const fresh = await generate(readFileSync(SNAPSHOT, "utf8"));
  if (fresh !== readFileSync(OUT, "utf8").replace(/\r\n/g, "\n")) {
    console.error("src/api/schema.gen.ts is stale; run `pnpm openapi`");
    process.exit(1);
  }
  console.log("schema.gen.ts is up to date");
} else {
  console.error("usage: tsx scripts/openapi.ts --write | --check");
  process.exit(2);
}
