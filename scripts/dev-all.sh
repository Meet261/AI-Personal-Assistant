#!/bin/bash
# Start Next.js dev server only.
# ChromaDB + cron run automatically via launchd (start at login, always on).
# Usage: npm run dev:all  or  npm run dev  (both do the same now)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."

trap 'echo; echo "Stopping Next.js..."; kill 0' SIGINT SIGTERM

echo "▶ Starting Next.js..."
echo "  ChromaDB → already running via launchd (port 8001)"
echo "  Cron     → already running via launchd"
echo ""

cd "$ROOT" && npx next dev --webpack
