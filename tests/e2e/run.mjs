// Runs Playwright with the e2e suite switches set as environment variables (cross-platform).
//   --author       WEFT_E2E_AUTHOR=1: missing LLM fixtures are written from the hand-written
//                  script tests/e2e/server/llm_script.py (never a real model), then replayed.
//   --walkthrough  the AC-UI walkthrough instead of the BOTs.
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const env = { ...process.env };
if (args.includes("--author")) env.WEFT_E2E_AUTHOR = "1";
if (args.includes("--walkthrough")) env.WEFT_E2E_SUITE = "walkthrough";
const rest = args.filter((a) => a !== "--author" && a !== "--walkthrough");
const result = spawnSync("pnpm", ["exec", "playwright", "test", ...rest], {
  stdio: "inherit",
  shell: true,
  env,
});
process.exit(result.status ?? 1);
