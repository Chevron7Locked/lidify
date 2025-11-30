#!/bin/sh
set -e

echo "[START] Starting Lidify Backend..."

# Docker Compose health checks ensure database and Redis are ready
# Add a small delay to be extra safe
echo "[WAIT] Waiting for services to be ready..."
sleep 3
echo "Services are ready"

# Run database migrations
echo "[DB] Running database migrations..."
npx prisma migrate deploy

# Generate Prisma client (in case of schema changes)
echo "[DB] Generating Prisma client..."
npx prisma generate

# Generate session secret if not provided
if [ -z "$SESSION_SECRET" ] || [ "$SESSION_SECRET" = "changeme-generate-secure-key" ]; then
  echo "[WARN] SESSION_SECRET not set or using default. Generating random key..."
  export SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
  echo "Generated SESSION_SECRET (will not persist across restarts - set it in .env for production)"
fi

# Ensure encryption key is stable between restarts
if [ -z "$SETTINGS_ENCRYPTION_KEY" ]; then
  echo "[WARN] SETTINGS_ENCRYPTION_KEY not set."
  echo "   Falling back to the default development key so encrypted data remains readable."
  echo "   Set SETTINGS_ENCRYPTION_KEY in your environment to a 32-character value for production."
  export SETTINGS_ENCRYPTION_KEY="default-encryption-key-change-me"
fi

echo "[START] Lidify Backend starting on port ${PORT:-3006}..."
echo "[CONFIG] Music path: ${MUSIC_PATH:-/music}"
echo "[CONFIG] Environment: ${NODE_ENV:-production}"

# Execute the main command
exec "$@"
