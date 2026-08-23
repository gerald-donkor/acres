# syntax=docker/dockerfile:1

# ---- deps: install only what @acres/server and @acres/shared need to build ----
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
COPY packages/shared/package.json packages/shared/package.json
# npm ci still validates every workspace declared in the root "workspaces"
# array against package-lock.json, so client/package.json must be present
# even though this image never builds or ships the client (verified this
# session; see prompts/14-server-deployment-infra.md). --ignore-scripts skips
# the root "prepare" hook (which would build @acres/shared here) and any
# package postinstall — both are run explicitly, in order, in the "build"
# stage below instead.
RUN npm ci --workspace=@acres/server --workspace=@acres/shared --include-workspace-root --ignore-scripts

# ---- build: compile @acres/shared, then @acres/server (which needs its dist) ----
FROM deps AS build
COPY packages/shared packages/shared
COPY server server
RUN npm run build --workspace=@acres/shared && \
    npm run build --workspace=@acres/server

# ---- prod-deps: a clean, production-only install of the same two workspaces ----
FROM node:24-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --omit=dev --workspace=@acres/server --workspace=@acres/shared --include-workspace-root --ignore-scripts

# ---- runtime: the shipped image ----
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/package.json ./package.json
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/server/package.json server/package.json
COPY --from=build /app/server/dist server/dist
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1
# Direct node invocation, not "npm run start:server": app.setup.ts's
# enableShutdownHooks() (docs/backend.md §3) needs SIGTERM delivered straight
# to the node process to drain in-flight requests before exit, which running
# npm as PID 1 does not reliably do. The accepted cost, already recorded in
# docs/backend.md §6, is that process.env.npm_package_version is unset
# outside an npm-run entrypoint, so GET /health reports "version": null from
# this image — a known, already-documented trade-off, not a new one.
CMD ["node", "server/dist/main.js"]
