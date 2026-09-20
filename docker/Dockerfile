# syntax=docker/dockerfile:1
#
# One image per Sibyl service, built from the monorepo:
#
#   docker build -f docker/Dockerfile --target api .
#   docker build -f docker/Dockerfile --target dashboard --build-arg NEXT_PUBLIC_SIBYL_API_URL=http://localhost:4000 .
#   docker build -f docker/Dockerfile --target worker .
#
# The build context is the repository root; docker/Dockerfile.dockerignore keeps host
# node_modules, build output and local data out of it.
#
# The TypeScript packages ship as source and run through tsx, so there is no compile step for the
# API or the worker; only the dashboard is built (next build).

FROM node:22-bookworm-slim AS base
ENV CI=true \
    NEXT_TELEMETRY_DISABLED=1
# A current corepack, so the pnpm version pinned in package.json ("packageManager") verifies.
RUN npm install -g corepack@latest && corepack enable
WORKDIR /repo

# ---------------------------------------------------------------------------------------------
FROM base AS deps
# Toolchain for native modules without a prebuilt binary for this platform (e.g. better-sqlite3).
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY . .
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------------------------
FROM deps AS api
ENV PORT=4000 \
    SIBYL_API_HOST=0.0.0.0 \
    SIBYL_DATA_DIR=/data/sessions
RUN mkdir -p /data/sessions && chown -R node:node /data
USER node
WORKDIR /repo/packages/api
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/api/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
# Same as `pnpm --filter @sibyl/api start` (tsx src/server.ts), without pnpm in the process tree.
CMD ["node", "--import", "tsx/esm", "src/server.ts"]

# ---------------------------------------------------------------------------------------------
FROM deps AS dashboard
# NEXT_PUBLIC_* values are inlined into the browser bundle by `next build`, so the API URL is a
# build argument, and it must be reachable from the user's browser (not a compose service name).
ARG NEXT_PUBLIC_SIBYL_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_SIBYL_API_URL=${NEXT_PUBLIC_SIBYL_API_URL}
WORKDIR /repo/packages/dashboard
RUN pnpm build && chown -R node:node .next
ENV NODE_ENV=production
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node_modules/.bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]

# ---------------------------------------------------------------------------------------------
FROM deps AS worker
# The worker starts sandboxes with the docker CLI; mount the host's /var/run/docker.sock.
COPY --from=docker:27-cli /usr/local/bin/docker /usr/local/bin/docker
WORKDIR /repo/packages/worker
# @sibyl/worker has no tsx dependency of its own; use the API package's copy.
CMD ["/repo/packages/api/node_modules/.bin/tsx", "src/index.ts"]
