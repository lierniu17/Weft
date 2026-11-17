// Runs Playwright with the e2e suite switches set as environment variables (cross-platform).
//   --author       WEFT_E2E_AUTHOR=1: missing LLM fixtures are written from the hand-written
//                  script tests/e2e/server/llm_script.py (never a real model), then replayed.
//   --walkthrough  the AC-UI walkthrough instead of the BOTs.
//   --remote       against an already-running environment (E2E_BASE_URL, e.g. stage on
//                  http://127.0.0.1:8080) instead of booting the local replay stack.
//                  Add --grep-invert @llm for the deterministic BOTs only.
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const env = { ...process.env };
if (args.includes("--author")) env.WEFT_E2E_AUTHOR = "1";
if (args.includes("--walkthrough")) env.WEFT_E2E_SUITE = "walkthrough";
if (args.includes("--remote")) {
  if (!env.E2E_BASE_URL) {
    console.error("--remote needs E2E_BASE_URL, e.g. E2E_BASE_URL=http://127.0.0.1:8080");
    process.exit(2);
  }
  if (args.includes("--author")) {
    console.error("--author records fixtures locally; it cannot run with --remote");
    process.exit(2);
  }
  env.WEFT_E2E_REMOTE = "1"; // only this switch makes the suite remote, never E2E_BASE_URL alone
} else {
  delete env.WEFT_E2E_REMOTE;
}
const rest = args.filter((a) => !["--author", "--walkthrough", "--remote"].includes(a));
const result = spawnSync("pnpm", ["exec", "playwright", "test", ...rest], {
  stdio: "inherit",
  shell: true,
  env,
});
process.exit(result.status ?? 1);
