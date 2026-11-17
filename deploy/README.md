# Deploying Weft

Docker Compose, one stack per environment, built from the checkout you run it in. The
cloud server is in mainland China (ADR-0002); so is the local build host. Everything here
runs from the repo root of a checkout (`worktree/stage`, `worktree/production`, or a
feature worktree for a local stage).

| | stage | production |
|---|---|---|
| compose project | `weft-stage` | `weft-production` |
| web (the only published port) | `127.0.0.1:8080` | `127.0.0.1:8090` |
| images | `weft-api:stage`, `weft-web:stage` | `weft-api:production`, `weft-web:production` |
| volumes | `weft-stage_postgres-data`, `weft-stage_neo4j-data`, `…_neo4j-logs` | `weft-production_…` |
| settings | `deploy/stage.env` | `deploy/production.env` |
| secrets (untracked) | `deploy/secrets/stage.env` | `deploy/secrets/production.env` |

Each stack has its own network and volumes; Postgres and Neo4j are not published on the
host, so the two never share data with each other or with the dev `docker-compose.yml`
(`:5432` / `:7687`, used by pytest and `pnpm e2e:bot`).

## Layout

- `apps/api/Dockerfile`: uv multi-stage build, non-root user, `alembic upgrade head` then
  uvicorn on :8000, healthcheck on `/api/health`. The git SHA is baked in (`APP_VERSION`)
  and `/api/health` reports it as `version`.
- `apps/web/Dockerfile`: Vite build (node:22-alpine), served by nginx:alpine with
  `deploy/nginx.conf`: the SPA under `/`, `/api/` proxied to the API container. Same
  origin, so the httpOnly session cookie works without CORS.
- `deploy/compose.yml`: postgres, neo4j, api, web, parameterized by the env files.
- `deploy/weft.mjs`: the CLI behind the root scripts.

## First time on a host

```bash
pnpm deploy:base-images              # pull base images through the mirror, retag them
cp deploy/secrets/stage.env.example deploy/secrets/stage.env   # fill it in, or:
node deploy/weft.mjs stage init-secrets   # random passwords; provider keys copied from apps/api/.env
```

Docker Hub and ghcr.io are not reachable from here (and the Aliyun mirror configured in
Docker Desktop answers 403 for public images), so `deploy:base-images` pulls through
DaoCloud (`docker.m.daocloud.io`, `ghcr.m.daocloud.io`; override with
`WEFT_REGISTRY_MIRROR` / `WEFT_GHCR_MIRROR`) and retags to the plain names the
Dockerfiles use. The Dockerfiles also have no `# syntax=` line on purpose: that would make
BuildKit fetch `docker/dockerfile` from Docker Hub. PyPI and npm are reached directly;
BuildKit cache mounts keep the uv and pnpm caches between builds (`NPM_REGISTRY` build arg
for a mirror if npm is slow).

## Commands

```bash
pnpm deploy:stage                    # build both images (SHA baked in), up -d --wait, verify /api/health
pnpm versions:stage                  # running SHA + image build time per service, /api/health, last deploys
pnpm logs:stage                      # follow logs (pnpm logs:stage api for one service)
pnpm db:migrate:stage                # alembic upgrade head (also runs on every API start)
pnpm invites:stage generate 5        # invite CLI inside the API container (list / revoke CODE too)
node deploy/weft.mjs stage cli seed --user LOGIN   # any `python -m weft.cli` command
node deploy/weft.mjs stage ps
pnpm down:stage                      # stop + remove containers; volumes are kept
```

`production` works the same (`pnpm deploy:production`, `pnpm versions:production`, …).

The version is `git rev-parse --short HEAD`, with `-dirty` when tracked files have
uncommitted changes, so a deploy from an unclean checkout is visible. After a deploy:

```bash
curl http://127.0.0.1:8080/api/health   # {"status":"ok","version":"<sha>"} = pnpm versions:stage
```

On the server, put a TLS reverse proxy in front of the web port (production sets
`SESSION_COOKIE_SECURE=true`; stage is plain http with a secure-less cookie named
`weft_stage_session`, so the two never overwrite each other's cookie on one host).
Back up the named volumes (`docker run --rm -v weft-production_postgres-data:/d ...`, or
`pg_dump` via `docker compose exec postgres`) before risky migrations.

## e2e:bot against stage

```bash
pnpm deploy:stage
E2E_BASE_URL=http://127.0.0.1:8080 pnpm e2e:bot:remote                     # all BOTs
E2E_BASE_URL=http://127.0.0.1:8080 pnpm e2e:bot:remote --grep-invert @llm  # deterministic only
```

Remote mode boots nothing: it checks `/api/health`, generates invite codes with the stage
admin CLI (`docker compose exec api python -m weft.cli invites generate`), and BOT-5 / BOT-9
write the seed graph the same way (`... cli seed --user <bot user>`). The browser keeps the
real clock (the stage API is not pinned to 2026-11-16), and date assertions follow it.
Override the CLI with `E2E_REMOTE_CLI` (a command prefix, e.g. an ssh wrapper around
`docker compose exec -T api python -m weft.cli`). It refuses `E2E_REMOTE_ENV=production`.

Stage talks to **real models** (spec: stage runs one round with real models):

- **Deterministic** on stage: BOT-1 (no LLM), BOT-9 (seed graph + graph queries), BOT-11
  (preconditions go through extraction, but nothing asserts on its output). BOT-10 too, but
  only with `E2E_LIMITED_BASE_URL` pointing at an API with `DAILY_ENTRY_LIMIT=2` on the same
  database; otherwise it is skipped.
- **Model-dependent**, tagged `@llm`: BOT-2, 3, 4, 6, 7, 12, 13 assert on what extraction
  produced (persons, items, counts, conflicts, feelings); BOT-5 and BOT-8 on the wording of
  Ask answers (BOT-5 runs on the seed graph, so its data is fixed, only the answers vary).
  A failure there is a finding to look at, not automatically a bug. Where the spec leaves
  the wording open (阿里 / 阿里巴巴, 社团 / 大学社团, 一般 / 疏远) remote runs accept either
  (`replayedOr` in `tests/e2e/support/bot.ts`); local replay assertions stay exact.

Run a subset by file name (`pnpm e2e:bot:remote bot-04 bot-12`); on Windows a `--grep`
pattern with `|` is mangled by the shell.

Screenshots of remote runs go to `tests/e2e/.results/screenshots-remote/` (untracked), so
the committed ones in `tests/e2e/screenshots/` always come from the local replay run.

The local `pnpm e2e:bot` is unchanged: replayed LLM fixtures, pinned clock, its own stack.
