# Stage 1: Build
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy root workspace files
COPY package.json bun.lock ./
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/
COPY packages/backend/package.json ./packages/backend/
COPY packages/bun-instrumentation-redis/package.json ./packages/bun-instrumentation-redis/
COPY packages/config/package.json ./packages/config/
COPY packages/sdk/package.json ./packages/sdk/
COPY packages/types/package.json ./packages/types/

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY apps/server/src ./apps/server/src
COPY apps/server/build.ts apps/server/tsconfig.json ./apps/server/
COPY packages/bun-instrumentation-redis/src ./packages/bun-instrumentation-redis/src
COPY packages/bun-instrumentation-redis/tsconfig.json ./packages/bun-instrumentation-redis/

# Build the application
WORKDIR /app/apps/server
RUN bun build.ts

# Stage 2: Final (Distroless)
FROM oven/bun:alpine

WORKDIR /app

# Copy the bundled application and migrations
COPY --from=builder /app/apps/server/dist/index.js ./index.js
COPY --from=builder /app/apps/server/src/db/migrations ./src/db/migrations

# Expose the port (default Hono port or from env)
EXPOSE 80

# Run the application
CMD ["bun", "run", "index.js"]
