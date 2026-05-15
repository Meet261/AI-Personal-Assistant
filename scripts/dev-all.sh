#!/bin/bash
# Start all dev services: Next.js + cron + ChromaDB
# Usage: npm run dev:all  (or ./scripts/dev-all.sh)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."
CHROMA="/Users/fury/opt/anaconda3/bin/chroma"

# Cleanup all child processes on Ctrl+C
trap 'echo; echo "Stopping all services..."; kill 0' SIGINT SIGTERM

echo "▶ Starting Next.js..."
cd "$ROOT" && npx next dev --webpack &
NEXT_PID=$!

echo "▶ Starting cron scheduler..."
node "$ROOT/scripts/cron.mjs" &
CRON_PID=$!

echo "▶ Starting ChromaDB on port 8001..."
"$CHROMA" run --port 8001 --path "$ROOT/.chroma-data" &
CHROMA_PID=$!

echo ""
echo "All services running:"
echo "  Next.js  → http://localhost:3000  (pid $NEXT_PID)"
echo "  Cron     → background             (pid $CRON_PID)"
echo "  ChromaDB → http://localhost:8001  (pid $CHROMA_PID)"
echo ""
echo "Press Ctrl+C to stop all."

wait
