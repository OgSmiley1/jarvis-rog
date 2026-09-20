#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "Missing .env. Run ./install.sh first."
  exit 1
fi
if [ ! -f .venv/bin/activate ]; then
  echo "Missing Python environment. Run ./install.sh first."
  exit 1
fi

source .venv/bin/activate
set -a
source .env
set +a
mkdir -p runtime logs
PIDFILE="runtime/jarvis.pid"

if command -v termux-wake-lock >/dev/null 2>&1; then
  termux-wake-lock >/dev/null 2>&1 || true
fi

if [ -f "$PIDFILE" ]; then
  PID="$(cat "$PIDFILE")"
  if kill -0 "$PID" 2>/dev/null; then
    echo "Already running: PID $PID"
    exit 0
  fi
fi

nohup python -m jarvis_bridge.server >> logs/jarvis.log 2>&1 &
echo $! > "$PIDFILE"
echo "Started JARVIS Termux bridge: PID $(cat "$PIDFILE")"
