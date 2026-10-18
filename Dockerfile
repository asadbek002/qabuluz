
# ---- build ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV CI=true
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# ---- runtime: only the standalone server, the bundled migrator and SQL migrations ----
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    UPLOAD_DIR=/app/data/uploads \
    MIGRATIONS_DIR=/app/drizzle

COPY --from=build --chown=node:node /app/dist/standalone ./
COPY --from=build --chown=node:node /app/dist/migrate/migrate.mjs ./migrate.mjs
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --chmod=755 scripts/docker-entrypoint.sh /usr/local/bin/app-entrypoint
RUN mkdir -p /app/data/uploads && chown -R node:node /app/data

EXPOSE 3000
VOLUME ["/app/data/uploads"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["app-entrypoint"]
