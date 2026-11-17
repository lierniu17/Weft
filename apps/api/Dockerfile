# Weft API image: FastAPI under uvicorn; runs `alembic upgrade head` before serving.
# Build context: apps/api. Built by deploy/compose.yml (see deploy/README.md):
#   docker build -f apps/api/Dockerfile --build-arg GIT_SHA=$(git rev-parse --short HEAD) apps/api
# Base images: Docker Hub / ghcr are not reachable from the mainland build host; pull them
# through a mirror and retag first (`pnpm deploy:base-images`).

ARG PYTHON_IMAGE=python:3.12-slim
ARG UV_IMAGE=ghcr.io/astral-sh/uv:0.13.8

FROM ${UV_IMAGE} AS uv

# --- build: resolve the locked dependencies into /app/.venv -------------------------------
FROM ${PYTHON_IMAGE} AS build
COPY --from=uv /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/app/.venv
WORKDIR /src
# Dependencies first (cached layer), the project itself second.
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --frozen --no-dev --no-install-project
COPY pyproject.toml uv.lock ./
COPY src ./src
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-editable

# --- runtime -------------------------------------------------------------------------------
FROM ${PYTHON_IMAGE} AS runtime
ARG GIT_SHA=unknown
ARG BUILD_TIME=unknown
LABEL org.opencontainers.image.title="weft-api" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.created="${BUILD_TIME}"
RUN groupadd --system --gid 10001 weft \
 && useradd --system --uid 10001 --gid weft --create-home --home-dir /home/weft weft
WORKDIR /app
COPY --from=build /app/.venv /app/.venv
COPY alembic.ini ./
COPY migrations ./migrations
ENV PATH=/app/.venv/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    APP_VERSION=${GIT_SHA} \
    WEFT_BUILD_TIME=${BUILD_TIME}
USER weft
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=6 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4)"]
# One process: background jobs (summaries) run in-process. Admin CLI in a running container:
#   docker compose exec api python -m weft.cli invites generate 5
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn weft.main:app --factory --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*' --no-server-header"]
