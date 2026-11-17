/**
 * Boots the whole e2e:bot stack and tears it down (Playwright globalSetup).
 *
 *   1. a fresh Postgres database `weft_e2e` (dropped, recreated, migrated);
 *      the dev database is never touched. Neo4j is shared, but every run registers fresh
 *      users, so each run writes into its own tenants (group_id = user id).
 *   2. the API twice, both in LLM replay mode over tests/e2e/fixtures/llm/:
 *        :8765  default limits           (every BOT but BOT-10)
 *        :8766  DAILY_ENTRY_LIMIT=2      (BOT-10)
 *   3. the web app (Vite) twice, proxying /api to each API.
 *   4. a pool of invite codes in tests/e2e/.state/invites.json.
 */
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { E2E, ROOT, STATE_DIR, serverEnv, uvArgs } from "./support/env.ts";

const children: ChildProcess[] = [];

function run(args: string[], cwd = ROOT, extra: Record<string, string> = {}) {
  return execFileSync("uv", args, {
    cwd,
    env: { ...serverEnv(), ...extra },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

function start(name: string, cmd: string, args: string[], env: Record<string, string>, cwd = ROOT) {
  const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: "pipe" });
  child.stdout?.on(
    "data",
    (d) => process.env.E2E_VERBOSE && process.stdout.write(`[${name}] ${d}`),
  );
  child.stderr?.on("data", (d) => {
    // Embeddings are answered 503 on purpose in e2e (no vectors); keep the log readable.
    const text = String(d);
    if (
      !text.includes("embedding") &&
      !text.includes("proxy error") &&
      !text.includes("ECONNREFUSED")
    )
      process.stderr.write(`[${name}] ${text}`);
  });
  children.push(child);
  return child;
}

async function waitFor(url: string, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timed out waiting for ${url}`);
}

function kill(child: ChildProcess) {
  if (child.pid === undefined || child.exitCode !== null) return;
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      // already gone
    }
  } else {
    child.kill("SIGTERM");
  }
}

export default async function globalSetup() {
  mkdirSync(STATE_DIR, { recursive: true });
  run(uvArgs("db-reset"));
  run(["run", "alembic", "upgrade", "head"], resolve(ROOT, "apps/api"));
  const codes = run(uvArgs("invites", "60")).trim().split(/\s+/);
  writeFileSync(resolve(STATE_DIR, "invites.json"), JSON.stringify({ codes, next: 0 }));

  const vite = resolve(ROOT, "apps/web/node_modules/vite/bin/vite.js");
  const web = resolve(ROOT, "apps/web");
  for (const stack of [E2E.main, E2E.limited]) {
    start(`api:${stack.api}`, "uv", uvArgs("serve", "--port", String(stack.api)), {
      ...serverEnv(),
      DAILY_ENTRY_LIMIT: String(stack.entryLimit),
    });
    start(
      `web:${stack.web}`,
      process.execPath,
      [vite, "--host", "127.0.0.1", "--port", String(stack.web), "--strictPort"],
      {
        WEFT_API_URL: `http://127.0.0.1:${stack.api}`,
        WEFT_WEB_PORT: String(stack.web),
      },
      web,
    );
  }
  const teardown = async () => {
    for (const child of children) kill(child);
  };
  try {
    for (const stack of [E2E.main, E2E.limited]) {
      await waitFor(`http://127.0.0.1:${stack.web}/api/health`);
      await waitFor(`http://127.0.0.1:${stack.web}/`);
    }
  } catch (e) {
    await teardown();
    throw e;
  }
  return teardown;
}
