# Lidify All-in-One Docker Image
# Contains: Backend, Frontend, PostgreSQL, Redis
# Usage: docker run -d -p 3030:3030 -v /path/to/music:/music lidify/lidify

FROM node:20-alpine

# Install system dependencies
RUN apk add --no-cache \
    postgresql16 \
    postgresql16-contrib \
    redis \
    supervisor \
    ffmpeg \
    wget \
    tini \
    openssl \
    bash \
    su-exec

# Create directories
RUN mkdir -p /app/backend /app/frontend /data/postgres /data/redis /run/postgresql /var/log/supervisor \
    && chown -R postgres:postgres /data/postgres /run/postgresql

# ============================================
# BACKEND BUILD
# ============================================
WORKDIR /app/backend

# Copy backend package files and install dependencies
COPY backend/package*.json ./
COPY backend/prisma ./prisma/
RUN echo "=== Migrations copied ===" && ls -la prisma/migrations/ && echo "=== End migrations ==="
RUN npm ci && npm cache clean --force
RUN npx prisma generate

# Copy backend source
COPY backend/src ./src
COPY backend/docker-entrypoint.sh ./

# Create cache directories
RUN mkdir -p /app/backend/cache/covers /app/backend/cache/transcodes /app/backend/logs

# ============================================
# FRONTEND BUILD
# ============================================
WORKDIR /app/frontend

# Copy frontend package files and install dependencies
COPY frontend/package*.json ./
RUN npm ci && npm cache clean --force

# Copy frontend source and build
COPY frontend/ ./

# Build Next.js (production)
ENV NEXT_PUBLIC_API_URL=
RUN npm run build

# ============================================
# CONFIGURATION
# ============================================
WORKDIR /app

# Create supervisord config
RUN cat > /etc/supervisord.conf << 'EOF'
[supervisord]
nodaemon=true
logfile=/var/log/supervisor/supervisord.log
pidfile=/var/run/supervisord.pid
user=root

[program:postgres]
command=/usr/bin/postgres -D /data/postgres
user=postgres
autostart=true
autorestart=true
stdout_logfile=/var/log/supervisor/postgres.log
stderr_logfile=/var/log/supervisor/postgres_err.log
priority=10

[program:redis]
command=/usr/bin/redis-server --dir /data/redis --appendonly yes
autostart=true
autorestart=true
stdout_logfile=/var/log/supervisor/redis.log
stderr_logfile=/var/log/supervisor/redis_err.log
priority=20

[program:backend]
command=/bin/sh -c "sleep 5 && cd /app/backend && npx tsx src/index.ts"
autostart=true
autorestart=true
stdout_logfile=/var/log/supervisor/backend.log
stderr_logfile=/var/log/supervisor/backend_err.log
directory=/app/backend
priority=30

[program:frontend]
command=/bin/sh -c "sleep 10 && cd /app/frontend && npm start"
autostart=true
autorestart=true
stdout_logfile=/var/log/supervisor/frontend.log
stderr_logfile=/var/log/supervisor/frontend_err.log
environment=NODE_ENV="production",BACKEND_URL="http://localhost:3006",PORT="3030"
priority=40
EOF

# Create startup script
RUN cat > /app/start.sh << 'EOF'
#!/bin/bash
set -e

# Initialize PostgreSQL if not already done
if [ ! -f /data/postgres/PG_VERSION ]; then
    echo "Initializing PostgreSQL database..."
    su-exec postgres initdb -D /data/postgres
    
    # Configure PostgreSQL
    echo "host all all 0.0.0.0/0 md5" >> /data/postgres/pg_hba.conf
    echo "listen_addresses='*'" >> /data/postgres/postgresql.conf
fi

# Start PostgreSQL temporarily to create database and user
su-exec postgres pg_ctl -D /data/postgres -w start

# Create user and database if they don't exist
su-exec postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname = 'lidify'" | grep -q 1 || \
    su-exec postgres psql -c "CREATE USER lidify WITH PASSWORD 'lidify';"
su-exec postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = 'lidify'" | grep -q 1 || \
    su-exec postgres psql -c "CREATE DATABASE lidify OWNER lidify;"

# Run Prisma migrations
cd /app/backend
export DATABASE_URL="postgresql://lidify:lidify@localhost:5432/lidify"
echo "Running Prisma migrations..."
ls -la prisma/migrations/ || echo "No migrations directory!"
npx prisma migrate deploy 2>&1 || {
    echo "Migrate deploy failed, trying db push..."
    npx prisma db push --force-reset --accept-data-loss 2>&1
}

# Stop PostgreSQL (supervisord will start it)
su-exec postgres pg_ctl -D /data/postgres -w stop

# Generate session secret if not provided
if [ -z "$SESSION_SECRET" ]; then
    export SESSION_SECRET=$(openssl rand -hex 32)
    echo "Generated SESSION_SECRET"
fi

# Generate encryption key if not provided  
if [ -z "$SETTINGS_ENCRYPTION_KEY" ]; then
    export SETTINGS_ENCRYPTION_KEY=$(openssl rand -hex 32)
    echo "Generated SETTINGS_ENCRYPTION_KEY"
fi

# Write environment file for backend (avoids sed issues with special chars)
cat > /app/backend/.env << ENVEOF
NODE_ENV=production
DATABASE_URL=postgresql://lidify:lidify@localhost:5432/lidify
REDIS_URL=redis://localhost:6379
PORT=3006
MUSIC_PATH=/music
TRANSCODE_CACHE_PATH=/app/backend/cache/transcodes
SESSION_SECRET=$SESSION_SECRET
SETTINGS_ENCRYPTION_KEY=$SETTINGS_ENCRYPTION_KEY
ENVEOF

echo "Starting Lidify..."
exec /usr/bin/supervisord -c /etc/supervisord.conf
EOF

RUN chmod +x /app/start.sh

# Expose ports
EXPOSE 3030

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3030 || exit 1

# Volumes
VOLUME ["/music", "/data"]

# Use tini for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/app/start.sh"]

