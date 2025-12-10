# Stage 1: Dependencies
FROM node:20-alpine AS deps

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci && \
    npm cache clean --force

# Stage 2: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package*.json ./

# Copy source code
COPY . .

# Accept build args for environment variables
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Build Next.js application
RUN npm run build

# Stage 3: Production (Hardened)
FROM node:20-alpine

WORKDIR /app

# Install tini first
RUN apk add --no-cache tini

# Set to production
ENV NODE_ENV=production

# Copy necessary files from builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# Copy healthcheck and entrypoint scripts
COPY healthcheck.js ./
COPY docker-entrypoint.sh /usr/local/bin/

# Create non-root user, set permissions, then remove dangerous tools
# NOTE: We keep /bin/sh because npm requires it to spawn processes
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001 && \
    chmod +x /usr/local/bin/docker-entrypoint.sh && \
    chown -R nextjs:nodejs /app && \
    # Remove package manager to prevent installing additional packages
    rm -rf /sbin/apk /usr/bin/apk /etc/apk /lib/apk /var/cache/apk && \
    # Remove download/network utilities (prevents downloading malware)
    rm -f /usr/bin/wget /usr/bin/curl /bin/wget /bin/curl 2>/dev/null || true && \
    rm -f /usr/bin/nc /bin/nc /usr/bin/ncat /usr/bin/netcat 2>/dev/null || true && \
    rm -f /usr/bin/ftp /usr/bin/tftp /usr/bin/telnet 2>/dev/null || true

USER nextjs

EXPOSE 3030

# Health check using Node.js (no wget needed)
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD ["node", "healthcheck.js"]

# Use tini for proper signal handling, with entrypoint script
ENTRYPOINT ["/sbin/tini", "--", "docker-entrypoint.sh"]
CMD ["npm", "start"]
