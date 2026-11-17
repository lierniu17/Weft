/**
 * Remote e2e:bot (Playwright globalSetup when E2E_BASE_URL is set): nothing is booted; the
 * BOTs run against an already-running environment, normally stage (`pnpm deploy:stage`).
 *
 *   1. refuses production: BOTs register users and write data;
 *   2. checks E2E_BASE_URL/api/health and prints the deployed version;
 *   3. generates a pool of invite codes with the environment's own admin CLI (inside the
 *      API container, see remoteCli) into tests/e2e/.state/invites.json.
 *
 * The seed graph (BOT-5 / BOT-9) is written the same way, per BOT user (support/bot.ts).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  REMOTE_BASE_URL,
  REMOTE_ENV,
  REMOTE_LIMITED_BASE_URL,
  ROOT,
  remoteCli,
  STATE_DIR,
} from "./support/env.ts";

export default async function globalSetupRemote() {
  if (REMOTE_ENV === "production" || process.env.WEFT_ENV === "production")
    throw new Error("e2e:bot never runs against production");
  for (const base of [REMOTE_BASE_URL, REMOTE_LIMITED_BASE_URL]) {
    if (!base) continue;
    const r = await fetch(`${base}/api/health`).catch((e: Error) => {
      throw new Error(`${base}/api/health unreachable (${e.message}); is ${REMOTE_ENV} up?`);
    });
    if (!r.ok) throw new Error(`${base}/api/health → ${r.status}`);
    const health = (await r.json()) as { version: string };
    console.log(`e2e:bot remote: ${base} (${REMOTE_ENV}) version ${health.version}`);
  }
  mkdirSync(STATE_DIR, { recursive: true });
  const [cmd, args] = remoteCli("invites", "generate", "20");
  const out = execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8" });
  const codes = out.trim().split(/\s+/).filter(Boolean);
  if (codes.length !== 20) throw new Error(`expected 20 invite codes, got: ${out}`);
  writeFileSync(resolve(STATE_DIR, "invites.json"), JSON.stringify({ codes, next: 0 }));
}
