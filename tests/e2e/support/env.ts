/** Shared e2e constants and the environment every Weft process of the e2e stack runs with. */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
export const STATE_DIR = resolve(ROOT, "tests/e2e/.state");
/** Committed BOT screenshots come from the local replay run; remote runs keep theirs apart. */
export const SCREENSHOTS =
  process.env.WEFT_E2E_REMOTE === "1"
    ? resolve(ROOT, "tests/e2e/.results/screenshots-remote")
    : resolve(ROOT, "tests/e2e/screenshots");

export const E2E = {
  main: { api: 8765, web: 5180, entryLimit: 50 },
  limited: { api: 8766, web: 5181, entryLimit: 2 },
} as const;

/**
 * Remote mode (`E2E_BASE_URL=http://127.0.0.1:8080 pnpm e2e:bot:remote`): the BOTs run
 * against an already-running environment (stage) instead of booting their own stack. The
 * API there talks to real models, so tests tagged `@llm` assert on model output and are a
 * judgement call; the rest are deterministic (deploy/README.md). Set by tests/e2e/run.mjs
 * --remote only, so a stray E2E_BASE_URL never turns `pnpm e2e:bot` remote.
 */
export const REMOTE_BASE_URL =
  process.env.WEFT_E2E_REMOTE === "1" ? trimSlash(process.env.E2E_BASE_URL) : undefined;
export const REMOTE = REMOTE_BASE_URL !== undefined;
/** Which deployment the remote run targets; the admin CLI (invites, seed) runs inside it. */
export const REMOTE_ENV = process.env.E2E_REMOTE_ENV ?? "stage";
/** BOT-10 needs an API with DAILY_ENTRY_LIMIT=2; remote runs skip it unless one is given. */
export const REMOTE_LIMITED_BASE_URL = REMOTE
  ? trimSlash(process.env.E2E_LIMITED_BASE_URL)
  : undefined;

function trimSlash(url: string | undefined): string | undefined {
  return url?.replace(/\/+$/, "") || undefined;
}

/**
 * The day every e2e run lives in. Local: pinned (the API's clock is pinned to it too).
 * Remote: the real now, since a deployed API runs on the real clock.
 */
export const TODAY = REMOTE ? new Date() : new Date("2026-11-16T10:00:00+08:00");

/** How long to wait for work done by the LLM (replayed: fast; real models: slow). */
export const LLM_WAIT = REMOTE ? 180_000 : 60_000;

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

/**
 * The admin CLI (`python -m weft.cli ...`) of the remote environment, as [command, ...args].
 * Default: inside the running API container via deploy/weft.mjs; override with
 * E2E_REMOTE_CLI (a space-separated command prefix, e.g. an ssh wrapper).
 */
export function remoteCli(...command: string[]): [string, string[]] {
  const custom = process.env.E2E_REMOTE_CLI?.trim();
  if (custom) {
    const [cmd, ...prefix] = custom.split(/\s+/);
    return [cmd, [...prefix, ...command]];
  }
  return [process.execPath, [resolve(ROOT, "deploy/weft.mjs"), REMOTE_ENV, "cli", ...command]];
}
