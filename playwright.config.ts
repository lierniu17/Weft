import { defineConfig, devices } from "@playwright/test";
import { E2E, REMOTE, REMOTE_BASE_URL, TODAY } from "./tests/e2e/support/env.ts";

// e2e:bot — the specs' BOTs (MVP BOT-1…BOT-13, GRAPH / STYLE / INTENT / CLARIFY / CONTEXT BOTs) against the real stack (FastAPI + Postgres + Neo4j +
// Vite), LLM calls replayed from tests/e2e/fixtures/llm/. `globalSetup` boots everything
// and tears it down, so `pnpm e2e:bot` needs nothing running beyond the docker databases.
//
// Remote mode (E2E_BASE_URL set, `pnpm e2e:bot:remote`): nothing is booted; the BOTs run
// against that already-running environment (stage, real models). See deploy/README.md.
export default defineConfig({
  testDir: "./tests/e2e",
  // `pnpm e2e:bot` runs the BOTs; `pnpm e2e:walkthrough` the AC-UI walkthrough.
  testMatch:
    process.env.WEFT_E2E_SUITE === "walkthrough"
      ? "**/walkthrough*.spec.ts"
      : [
          "**/bot-*.spec.ts",
          "**/graph-*.spec.ts",
          "**/style-*.spec.ts",
          "**/intent-*.spec.ts",
          "**/clarify-*.spec.ts",
          "**/context-*.spec.ts",
        ],
  globalSetup: REMOTE ? "./tests/e2e/global-setup.remote.ts" : "./tests/e2e/global-setup.ts",
  // One shared database and Neo4j; BOTs create their own users, but run them in order.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  // Real models answer in seconds, not milliseconds.
  timeout: REMOTE ? 600_000 : 120_000,
  expect: { timeout: REMOTE ? 30_000 : 15_000 },
  outputDir: "./tests/e2e/.results",
  reporter: [["list"]],
  use: {
    baseURL: REMOTE_BASE_URL ?? `http://127.0.0.1:${E2E.main.web}`,
    timezoneId: "Asia/Shanghai",
    locale: "zh-CN",
    contextOptions: { reducedMotion: "reduce" },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "bot",
      use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 } },
    },
  ],
  metadata: { today: TODAY.toISOString(), target: REMOTE_BASE_URL ?? "local replay stack" },
});
