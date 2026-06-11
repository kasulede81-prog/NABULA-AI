#!/bin/sh
# Railway start wrapper — maps Railway PORT to API_PORT without changing app code.
set -e

# Monorepo root (apps/api/scripts → ../../..)
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

export API_HOST="${API_HOST:-0.0.0.0}"
export API_PORT="${PORT:-${API_PORT:-3001}}"

echo "[railway] Applying database migrations..."
pnpm --filter @nebula/database migrate:deploy

echo "[railway] Starting API on ${API_HOST}:${API_PORT}..."
cd apps/api
exec node dist/index.js
