# Stage 1: Build
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy workspace manifests for dependency installation
COPY package.json bun.lock ./
COPY apps/server/package.json ./apps/server/
COPY packages/bun-instrumentation-pg/package.json ./packages/bun-instrumentation-pg/
COPY packages/bun-instrumentation-redis/package.json ./packages/bun-instrumentation-redis/

# Install all workspace dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY apps/server/src ./apps/server/src
COPY apps/server/build.ts apps/server/tsconfig.json ./apps/server/
COPY packages/bun-instrumentation-pg/src ./packages/bun-instrumentation-pg/src
COPY packages/bun-instrumentation-redis/src ./packages/bun-instrumentation-redis/src

# Build both entrypoints for container mode
WORKDIR /app/apps/server
RUN bun build.ts --container

# Stage 2: Runtime
FROM oven/bun:1-alpine

WORKDIR /app

# Copy bundled app, otel preload and migrations
COPY --from=builder /app/apps/server/dist/index.js ./index.js
COPY --from=builder /app/apps/server/dist/otel.js ./otel.js
COPY --from=builder /app/apps/server/src/db/migrations ./src/db/migrations

EXPOSE 5051

CMD ["bun", "--preload", "./otel.js", "run", "./index.js"]
