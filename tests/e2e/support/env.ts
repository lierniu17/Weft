/** Shared e2e constants and the environment every Weft process of the e2e stack runs with. */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
export const STATE_DIR = resolve(ROOT, "tests/e2e/.state");
export const SCREENSHOTS = resolve(ROOT, "tests/e2e/screenshots");

export const E2E = {
  main: { api: 8765, web: 5180, entryLimit: 50 },
  limited: { api: 8766, web: 5181, entryLimit: 2 },
} as const;

/** The day every e2e run lives in (the API's clock is pinned to it too). */
export const TODAY = new Date("2026-11-16T10:00:00+08:00");

export const AUTHOR = process.env.WEFT_E2E_AUTHOR === "1";

export function serverEnv(): Record<string, string> {
  return {
    ...(process.env as Record<string, string>),
    DATABASE_URL: "postgresql+asyncpg://weft:weft@localhost:5432/weft_e2e",
    // Belt and braces: weft_e2e.py blanks these too. No e2e process may hold a real key.
    DEEPSEEK_API_KEY: "",
    DASHSCOPE_API_KEY: "",
    LLM_REPLAY_MODE: "replay",
    LLM_FIXTURES_DIR: resolve(ROOT, "tests/e2e/fixtures/llm"),
    PYTHONIOENCODING: "utf-8",
    WEFT_E2E_AUTHOR: AUTHOR ? "1" : "0",
  };
}

export function uvArgs(...command: string[]): string[] {
  return [
    "run",
    "--quiet",
    "--project",
    resolve(ROOT, "apps/api"),
    "python",
    resolve(ROOT, "tests/e2e/server/weft_e2e.py"),
    ...command,
  ];
}
