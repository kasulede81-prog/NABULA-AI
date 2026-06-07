#!/bin/sh
# Railway start wrapper — maps Railway PORT to API_PORT without changing app code.
set -e

cd "$(dirname "$0")/.."

export API_HOST="${API_HOST:-0.0.0.0}"
export API_PORT="${PORT:-${API_PORT:-3001}}"

exec node dist/index.js
