#!/usr/bin/env node
// Weft deployment CLI: Docker Compose per environment (deploy/README.md).
//
//   node deploy/weft.mjs <stage|production> <command> [args...]
//
//   deploy            build both images from this checkout (git SHA baked in), start or
//                     update the stack, wait for healthy, check /api/health shows the SHA
//   versions          the running SHA + image build time per service, /api/health, and the
//                     last deployments of this environment
//   logs [svc...]     follow the logs (default: all services)
//   migrate           alembic upgrade head (deploy also runs it on every API start)
//   cli <args...>     python -m weft.cli <args...> inside the running API container
//   invites <args...> shorthand for `cli invites <args...>`
//   ps | down         status | stop and remove containers (volumes are kept)
//   init-secrets      create deploy/secrets/<env>.env with random passwords; provider keys
//                     are copied from apps/api/.env when present (never printed)
//
//   node deploy/weft.mjs base-images   pull the base images through the registry mirror
//                                      (WEFT_REGISTRY_MIRROR) and retag them
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEPLOY = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(DEPLOY, "..");
const ENVS = ["stage", "production"];

// Docker Desktop on Windows does not always put its CLI on the PATH of non-login shells.
if (process.platform === "win32" && process.env.LOCALAPPDATA) {
  const bin = resolve(process.env.LOCALAPPDATA, "Programs/DockerDesktop/resources/bin");
  if (existsSync(bin)) process.env.PATH = `${process.env.PATH}${delimiter}${bin}`;
}

function die(message) {
  console.error(`weft deploy: ${message}`);
  process.exit(1);
}

function readEnvFile(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

/** The git short SHA of this checkout; `-dirty` when tracked files have local changes. */
function gitVersion() {
  const sha = git("rev-parse", "--short", "HEAD");
  return git("status", "--porcelain", "--untracked-files=no") ? `${sha}-dirty` : sha;
}

function config(env) {
  const envFile = resolve(DEPLOY, `${env}.env`);
  const values = readEnvFile(envFile);
  const secrets = resolve(DEPLOY, values.WEFT_SECRETS_FILE ?? `secrets/${env}.env`);
  return { env, project: `weft-${env}`, envFile, secrets, values };
}

function composeArgs(cfg, args) {
  const files = ["--env-file", cfg.envFile];
  if (existsSync(cfg.secrets)) files.push("--env-file", cfg.secrets);
  return ["compose", "-p", cfg.project, "-f", resolve(DEPLOY, "compose.yml"), ...files, ...args];
}

function compose(cfg, args, { extraEnv = {}, capture = false, check = true } = {}) {
  const result = spawnSync("docker", composeArgs(cfg, args), {
    cwd: ROOT,
    env: { ...process.env, ...extraEnv },
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    encoding: "utf8",
  });
  if (result.error) die(`cannot run docker: ${result.error.message}`);
  if (check && result.status !== 0) process.exit(result.status ?? 1);
  return capture ? result.stdout.trim() : result.status;
}

function requireSecrets(cfg) {
  if (!existsSync(cfg.secrets))
    die(
      `missing ${cfg.secrets}\n  copy deploy/secrets/${cfg.env}.env.example and fill it in, ` +
        `or run: node deploy/weft.mjs ${cfg.env} init-secrets`,
    );
  const s = readEnvFile(cfg.secrets);
  const empty = ["POSTGRES_PASSWORD", "NEO4J_PASSWORD", "SESSION_SECRET"].filter((k) => !s[k]);
  if (empty.length) die(`${cfg.secrets}: set ${empty.join(", ")}`);
  for (const k of ["DEEPSEEK_API_KEY", "DASHSCOPE_API_KEY"])
    if (!s[k]) console.warn(`weft deploy: warning: ${k} is empty; LLM features will fail`);
}

async function health(cfg) {
  const url = `http://127.0.0.1:${cfg.values.WEFT_WEB_PORT}/api/health`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return { url, status: r.status, body: await r.json().catch(() => null) };
  } catch (e) {
    return { url, status: 0, body: null, error: String(e.cause?.code ?? e.message) };
  }
}

function historyFile(env) {
  return resolve(DEPLOY, "state", `${env}-deployments.log`);
}

async function deploy(cfg) {
  requireSecrets(cfg);
  const version = gitVersion();
  const builtAt = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const extraEnv = { WEFT_GIT_SHA: version, WEFT_BUILD_TIME: builtAt, DOCKER_BUILDKIT: "1" };
  console.log(`weft deploy: ${cfg.env} ← ${version} (built ${builtAt})`);
  const started = Date.now();
  compose(cfg, ["build", "api", "web"], { extraEnv });
  const built = Math.round((Date.now() - started) / 1000);
  compose(cfg, ["up", "-d", "--wait", "--wait-timeout", "300", "--remove-orphans"], { extraEnv });
  const h = await health(cfg);
  if (h.status !== 200 || h.body?.version !== version)
    die(`${h.url} → ${h.status} ${JSON.stringify(h.body)}; expected version ${version}`);
  mkdirSync(dirname(historyFile(cfg.env)), { recursive: true });
  appendFileSync(historyFile(cfg.env), `${builtAt}\t${version}\n`);
  console.log(`weft deploy: ${cfg.env} is up at http://127.0.0.1:${cfg.values.WEFT_WEB_PORT}/`);
  console.log(`weft deploy: ${h.url} → 200 version=${version} (images built in ${built}s)`);
}

async function versions(cfg) {
  const ids = compose(cfg, ["ps", "-q"], { capture: true }).split(/\s+/).filter(Boolean);
  console.log(`${cfg.project}  http://127.0.0.1:${cfg.values.WEFT_WEB_PORT}/`);
  if (!ids.length) console.log("  (not running)");
  for (const id of ids) {
    const format = [
      '{{index .Config.Labels "com.docker.compose.service"}}',
      "{{.Config.Image}}",
      '{{index .Config.Labels "org.opencontainers.image.revision"}}',
      '{{index .Config.Labels "org.opencontainers.image.created"}}',
      "{{.State.Status}}{{if .State.Health}}/{{.State.Health.Status}}{{end}}",
      "{{.State.StartedAt}}",
    ].join("\t");
    const line = execFileSync("docker", ["inspect", "--format", format, id], {
      encoding: "utf8",
    }).trim();
    const [service, image, revision, created, state, startedAt] = line.split("\t");
    const sha = revision ? `sha ${revision}  built ${created}  ` : "";
    console.log(
      `  ${service.padEnd(9)}${image.padEnd(22)}${sha}${state}  up since ${startedAt.slice(0, 19)}Z`,
    );
  }
  const h = await health(cfg);
  console.log(`  ${h.url} → ${h.status || h.error} ${h.body ? JSON.stringify(h.body) : ""}`);
  if (existsSync(historyFile(cfg.env))) {
    const last = readFileSync(historyFile(cfg.env), "utf8").trim().split("\n").slice(-5);
    console.log("  recent deployments (from this checkout):");
    for (const l of last.reverse()) console.log(`    ${l.replace("\t", "  ")}`);
  }
}

function initSecrets(cfg) {
  if (existsSync(cfg.secrets)) die(`${cfg.secrets} already exists; not overwriting`);
  const dev = resolve(ROOT, "apps/api/.env");
  const keys = existsSync(dev) ? readEnvFile(dev) : {};
  const hex = (n) => randomBytes(n).toString("hex");
  const lines = [
    `# Secrets for ${cfg.env} (untracked). Generated by deploy/weft.mjs init-secrets.`,
    `POSTGRES_PASSWORD=${hex(24)}`,
    `NEO4J_PASSWORD=${hex(24)}`,
    `SESSION_SECRET=${hex(32)}`,
    `DEEPSEEK_API_KEY=${keys.DEEPSEEK_API_KEY ?? ""}`,
    `DASHSCOPE_API_KEY=${keys.DASHSCOPE_API_KEY ?? ""}`,
    "",
  ];
  mkdirSync(dirname(cfg.secrets), { recursive: true });
  writeFileSync(cfg.secrets, lines.join("\n"), { mode: 0o600 });
  const copied = ["DEEPSEEK_API_KEY", "DASHSCOPE_API_KEY"].filter((k) => keys[k]);
  console.log(
    `wrote ${cfg.secrets} (random passwords; ${copied.length ? `${copied.join(", ")} copied from apps/api/.env` : "provider keys empty: fill them in"})`,
  );
}

function baseImages() {
  const mirror = process.env.WEFT_REGISTRY_MIRROR ?? "docker.m.daocloud.io";
  const ghcr = process.env.WEFT_GHCR_MIRROR ?? "ghcr.m.daocloud.io";
  const images = [
    [`${mirror}/library/python:3.12-slim`, "python:3.12-slim"],
    [`${mirror}/library/node:22-alpine`, "node:22-alpine"],
    [`${mirror}/library/nginx:alpine`, "nginx:alpine"],
    [`${mirror}/library/postgres:16`, "postgres:16"],
    [`${mirror}/library/neo4j:5.26`, "neo4j:5.26"],
    [`${ghcr}/astral-sh/uv:0.13.8`, "ghcr.io/astral-sh/uv:0.13.8"],
  ];
  for (const [from, to] of images) {
    console.log(`pull ${from} → ${to}`);
    const pulled = spawnSync("docker", ["pull", "-q", from], { stdio: "inherit" });
    if (pulled.status !== 0) die(`cannot pull ${from}`);
    execFileSync("docker", ["tag", from, to]);
  }
}

async function main() {
  const [first, command, ...rest] = process.argv.slice(2);
  if (first === "base-images") return baseImages();
  if (!ENVS.includes(first) || !command)
    die("usage: node deploy/weft.mjs <stage|production> <command> [args]  (see the header)");
  const cfg = config(first);
  switch (command) {
    case "deploy":
      return deploy(cfg);
    case "versions":
      return versions(cfg);
    case "logs":
      return compose(cfg, ["logs", "-f", "--tail", "200", ...rest]);
    case "migrate":
      requireSecrets(cfg);
      return compose(cfg, ["run", "--rm", "api", "alembic", "upgrade", "head"]);
    case "cli":
    case "invites": {
      const args = command === "invites" ? ["invites", ...rest] : rest;
      return process.exit(
        compose(cfg, ["exec", "-T", "api", "python", "-m", "weft.cli", ...args], { check: false }),
      );
    }
    case "ps":
      return compose(cfg, ["ps"]);
    case "down":
      return compose(cfg, ["down"]);
    case "init-secrets":
      return initSecrets(cfg);
    default:
      die(`unknown command ${command}`);
  }
}

await main();
