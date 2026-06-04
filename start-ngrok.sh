#!/usr/bin/env bash
# Serve Aurora Lab locally and expose it with ngrok (port 3000).
# One-time setup: https://dashboard.ngrok.com/get-started/your-authtoken
#   npx ngrok config add-authtoken YOUR_TOKEN
# Spotify: add your ngrok URL (e.g. https://xxxx.ngrok-free.app/) as a Redirect URI.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
PORT="${PORT:-3000}"
NGROK="npx --yes ngrok@latest"

cd "$ROOT"

if ! lsof -ti:"$PORT" >/dev/null 2>&1; then
  echo "Starting local server on http://127.0.0.1:$PORT ..."
  python3 -m http.server "$PORT" &
  echo $! > .aurora-server.pid
  sleep 0.5
else
  echo "Port $PORT already in use (server assumed running)."
fi

echo "Starting ngrok tunnel to port $PORT ..."
echo "Inspector: http://127.0.0.1:4040"
exec $NGROK http "$PORT"
