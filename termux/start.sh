#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
source .venv/bin/activate
set -a
source .env
set +a
mkdir -p runtime logs
PIDFILE="runtime/jarvis.pid"

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
