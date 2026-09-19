#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
PIDFILE="runtime/jarvis.pid"

if [ ! -f "$PIDFILE" ]; then
  echo "JARVIS bridge is not running."
  exit 0
fi

PID="$(cat "$PIDFILE")"
if kill -0 "$PID" 2>/dev/null; then
  kill "$PID"
fi
rm -f "$PIDFILE"
echo "Stopped JARVIS bridge."
