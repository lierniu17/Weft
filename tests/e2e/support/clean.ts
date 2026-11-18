/**
 * Deletes the e2e run's graphs from Neo4j (`weft_e2e.py clean-graph`).
 *
 * The e2e stack has its own Postgres database but shares Neo4j with the dev stack and
 * pytest, and Neo4j's fulltext statistics are index-wide: whatever e2e leaves behind
 * changes search results elsewhere. Global setup cleans up before a run (a crashed run
 * never reached its teardown) and teardown after it; `pnpm e2e:clean` does the same by
 * hand, `pnpm e2e:clean --orphans` also removes leftovers of runs whose users are gone.
 */
import { execFileSync } from "node:child_process";
import { ROOT, serverEnv, uvArgs } from "./env.ts";

export function cleanGraph(...flags: string[]): void {
  execFileSync("uv", uvArgs("clean-graph", ...flags), {
    cwd: ROOT,
    env: serverEnv(),
    stdio: ["ignore", "inherit", "inherit"],
  });
}
