# =============================================================================
# Production Hardened Containerfile
# =============================================================================
# Build: podman build -f containers/Containerfile.app -t llm-agent:latest .
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Dependencies (cached layer - production only)
# -----------------------------------------------------------------------------
FROM oven/bun:1 AS deps

WORKDIR /app

COPY package.json bun.lock* bun.lockb* ./
RUN bun install --frozen-lockfile --production && rm -rf /tmp/*

# -----------------------------------------------------------------------------
# Stage 2: Builder
# -----------------------------------------------------------------------------
FROM oven/bun:1 AS builder

WORKDIR /app

# Install ALL dependencies (including dev) for build
COPY package.json bun.lock* bun.lockb* ./
RUN bun install --frozen-lockfile

# Copy only files required for build
COPY app.config.ts tsconfig.json ./
COPY src ./src
COPY public ./public
COPY tests/route-auth-guard.test.ts ./tests/route-auth-guard.test.ts
RUN bun --bun run build

# -----------------------------------------------------------------------------
# Stage 3: Production Runtime
# -----------------------------------------------------------------------------
FROM oven/bun:1 AS production

WORKDIR /app

# Security updates, minimal runtime deps
# NOTE pandoc required for app
RUN apt-get update && apt-get upgrade -y && \
    apt-get install -y --no-install-recommends dumb-init pandoc && \
    rm -rf /var/lib/apt/lists/* && \
    apt-get clean

# Non-root user with explicit UID/GID
RUN groupadd --gid 1001 appgroup && \
    useradd --uid 1001 --gid appgroup --shell /bin/false --create-home appuser

# Create data directory for SQLite (volume mount point)
RUN mkdir -p /app/data && chown appuser:appgroup /app/data

# Bundle required seed document
COPY --chown=appuser:appgroup ["data/Product Disclosure Statement (PDS).docx", "/app/data/Product Disclosure Statement (PDS).docx"]

# Copy production dependencies (bcrypt)
COPY --from=deps --chown=appuser:appgroup /app/node_modules ./node_modules

# Copy built application (Vinxi/SolidStart outputs to .output/)
COPY --from=builder --chown=appuser:appgroup /app/.output ./.output
COPY --from=builder --chown=appuser:appgroup /app/package.json ./

# Management scripts (for `podman exec` user admin)
COPY --chown=appuser:appgroup scripts ./scripts
COPY --chown=appuser:appgroup src/lib ./src/lib
COPY --from=builder --chown=appuser:appgroup /app/tsconfig.json ./

ENV NODE_ENV=production

USER appuser

EXPOSE 3075

# Proper signal handling with dumb-init
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["bun", "--bun", "run", ".output/server/index.mjs"]
