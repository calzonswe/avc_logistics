#!/bin/sh
set -e

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
until PGPASSWORD="${POSTGRES_PASSWORD}" psql -h "${POSTGRES_HOST:-postgres}" -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-avc_management}" -c "SELECT 1" > /dev/null 2>&1; do
  echo "PostgreSQL is unavailable - sleeping"
  sleep 2
done
echo "PostgreSQL is ready"

# Run database migrations
echo "Running database migrations..."
export DATABASE_URL="postgresql://${POSTGRES_USER:-postgres}:${POSTGRES_PASSWORD}@${POSTGRES_HOST:-postgres}:5432/${POSTGRES_DB:-avc_management}"
export NODE_ENV="${NODE_ENV:-production}"
export PORT="${PORT:-3000}"
export HOST="${HOST:-0.0.0.0}"
export UPLOAD_DIR="${UPLOAD_DIR:-./uploads}"
export JWT_SECRET="${JWT_SECRET}"
export JWT_EXPIRES_IN="${JWT_EXPIRES_IN:-15m}"
export REFRESH_TOKEN_EXPIRES_IN="${REFRESH_TOKEN_EXPIRES_IN:-7d}"
export CORS_ORIGIN="${CORS_ORIGIN}"
export WEB_URL="${WEB_URL}"
export VAPID_PUBLIC_KEY="${VAPID_PUBLIC_KEY:-}"
export VAPID_PRIVATE_KEY="${VAPID_PRIVATE_KEY:-}"
export VAPID_SUBJECT="${VAPID_SUBJECT:-mailto:admin@example.com}"
export LOG_LEVEL="${LOG_LEVEL:-info}"
export LOG_PRETTY="${LOG_PRETTY:-false}"

npx tsx apps/api/src/db/migrate.ts

# Seed the database (idempotent - safe to run on every start)
echo "Seeding database..."
npx tsx apps/api/src/db/seed.ts

# Start the API
echo "Starting API server..."
exec node apps/api/dist/index.js