import { defineConfig, devices } from "@playwright/test";
import { E2E, TODAY } from "./tests/e2e/support/env.ts";

// e2e:bot — the spec's BOT-1…BOT-13 against the real stack (FastAPI + Postgres + Neo4j +
// Vite), LLM calls replayed from tests/e2e/fixtures/llm/. `globalSetup` boots everything
// and tears it down, so `pnpm e2e:bot` needs nothing running beyond the docker databases.
export default defineConfig({
  testDir: "./tests/e2e",
  // `pnpm e2e:bot` runs the BOTs; `pnpm e2e:walkthrough` the AC-UI walkthrough.
  testMatch:
    process.env.WEFT_E2E_SUITE === "walkthrough" ? "**/walkthrough.spec.ts" : "**/bot-*.spec.ts",
  globalSetup: "./tests/e2e/global-setup.ts",
  // One shared database and Neo4j; BOTs create their own users, but run them in order.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  outputDir: "./tests/e2e/.results",
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${E2E.main.web}`,
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
  metadata: { today: TODAY.toISOString() },
});
