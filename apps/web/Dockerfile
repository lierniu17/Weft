# Weft web image: the Vite build served by nginx, with /api proxied to the API container
# (same origin, so the httpOnly session cookie just works). Build context: the repo root.
#   docker build -f apps/web/Dockerfile .
# Base images come through a mirror (`pnpm deploy:base-images`), see deploy/README.md.

ARG NODE_IMAGE=node:22-alpine
ARG NGINX_IMAGE=nginx:alpine

# --- build ---------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS build
ARG NPM_REGISTRY=
ENV PNPM_HOME=/pnpm CI=true
RUN --mount=type=cache,target=/root/.npm \
    npm install -g pnpm@10.33.0 ${NPM_REGISTRY:+--registry=$NPM_REGISTRY}
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=weft-pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store \
 && if [ -n "$NPM_REGISTRY" ]; then pnpm config set registry "$NPM_REGISTRY"; fi \
 && pnpm install --frozen-lockfile --filter @weft/web
COPY apps/web apps/web
RUN pnpm --filter @weft/web build

# --- runtime -------------------------------------------------------------------------------
FROM ${NGINX_IMAGE} AS runtime
ARG GIT_SHA=unknown
ARG BUILD_TIME=unknown
LABEL org.opencontainers.image.title="weft-web" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.created="${BUILD_TIME}"
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/apps/web/dist /usr/share/nginx/html
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=6 \
  CMD ["wget", "-q", "--spider", "http://127.0.0.1/"]
