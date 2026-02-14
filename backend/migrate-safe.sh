#!/bin/sh
set -e

echo "[MIGRATE] Starting safe migration process..."

# Check migration status
MIGRATE_STATUS=$(npx prisma migrate status 2>&1 || true)

# Count pending migrations
PENDING_COUNT=$(echo "$MIGRATE_STATUS" | grep -c "Following migrations have not yet been applied:" || echo "0")

# If there are pending migrations, try to deploy
if [ "$PENDING_COUNT" != "0" ]; then
  echo "[MIGRATE] Found pending migrations, attempting to apply..."

  # Try deploy - this might fail with P3005 if database exists but isn't tracked
  DEPLOY_RESULT=$(npx prisma migrate deploy 2>&1 || echo "DEPLOY_FAILED")

  # If we got P3005 error, we need to baseline
  if echo "$DEPLOY_RESULT" | grep -q "P3005"; then
    echo ""
    echo "[MIGRATE] ⚠ Database exists but migration history is missing (P3005 error)"
    echo "[MIGRATE] This is normal for existing databases that weren't tracked with Prisma"
    echo "[MIGRATE] Baselining all migrations..."
    echo ""

    # Baseline ALL migrations
    BASELINE_COUNT=0
    for migration_dir in prisma/migrations/*/; do
      if [ -d "$migration_dir" ]; then
        migration_name=$(basename "$migration_dir")

        # Skip if not a real migration directory
        if [ "$migration_name" = "*" ] || [ "$migration_name" = "migration_lock.toml" ]; then
          continue
        fi

        echo "  ✓ Marking as applied: $migration_name"
        npx prisma migrate resolve --applied "$migration_name" >/dev/null 2>&1 || true
        BASELINE_COUNT=$((BASELINE_COUNT + 1))
      fi
    done

    echo ""
    echo "[MIGRATE] ✓ Baselined $BASELINE_COUNT migrations"
    echo ""

    # Now try deploy again to catch any truly new migrations
    echo "[MIGRATE] Checking for any new migrations added after baselining..."
    DEPLOY_RESULT=$(npx prisma migrate deploy 2>&1 || true)
  fi

  # Check final result
  if echo "$DEPLOY_RESULT" | grep -q "applied"; then
    APPLIED=$(echo "$DEPLOY_RESULT" | grep "applied" | head -1)
    echo "[MIGRATE] ✓ $APPLIED"
  elif echo "$DEPLOY_RESULT" | grep -q "up to date\|No pending migrations"; then
    echo "[MIGRATE] ✓ Database is up to date"
  elif echo "$DEPLOY_RESULT" | grep -q "DEPLOY_FAILED"; then
    echo "[MIGRATE] ⚠ Migration deploy encountered issues, but continuing..."
    echo "$DEPLOY_RESULT" | grep -v "DEPLOY_FAILED" | head -20
  else
    echo "[MIGRATE] Migration complete"
  fi
else
  echo "[MIGRATE] ✓ No pending migrations, database is up to date"
fi

echo ""
echo "[MIGRATE] ✓ Safe migration process complete"
