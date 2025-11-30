# Stage 1: Dependencies (all deps for tsx runtime)
FROM node:20-alpine AS deps

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install ALL dependencies (tsx needs dev dependencies)
RUN npm ci && \
    npm cache clean --force

# Generate Prisma Client
RUN npx prisma generate

# Stage 2: Production runtime
FROM node:20-alpine

# Install runtime dependencies (including OpenSSL for Prisma)
RUN apk add --no-cache \
    wget \
    ffmpeg \
    tini \
    openssl \
    openssl-dev

WORKDIR /app

# Copy all node_modules (including tsx)
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package*.json ./
COPY --from=deps /app/prisma ./prisma

# Copy source code (will run with tsx, not compiled)
COPY src ./src

# Create necessary directories with proper permissions
RUN mkdir -p /app/cache/covers /app/cache/transcodes /app/logs && \
    chown -R node:node /app

# Use non-root user
USER node

# Copy and setup entrypoint script
COPY --chown=node:node docker-entrypoint.sh /usr/local/bin/
USER root
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
USER node

EXPOSE 3006

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3006/health || exit 1

# Use tini for proper signal handling
ENTRYPOINT ["/sbin/tini", "--", "docker-entrypoint.sh"]
CMD ["npx", "tsx", "src/index.ts"]
