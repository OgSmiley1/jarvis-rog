#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

MODEL="${JARVIS_OLLAMA_MODEL:-llama3.2:3b}"
HOST="127.0.0.1"
PORT="11434"
LOG="${HOME}/.ollama/jarvis-server.log"
PID_FILE="${HOME}/.ollama/jarvis-server.pid"

pkg update -y
pkg install -y curl ollama termux-api
command -v termux-wake-lock >/dev/null && termux-wake-lock || true
mkdir -p "${HOME}/.ollama"

if ! curl --fail --silent --show-error --max-time 2 "http://${HOST}:${PORT}/api/tags" >/dev/null 2>&1; then
  nohup ollama serve >"${LOG}" 2>&1 &
  echo "$!" >"${PID_FILE}"
fi

ready=0
for _ in $(seq 1 30); do
  if curl --fail --silent --show-error --max-time 2 "http://${HOST}:${PORT}/api/tags" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  echo "Ollama did not become ready. See ${LOG}" >&2
  exit 1
fi

ollama pull "${MODEL}"
echo "Ollama is ready for JARVIS: ${MODEL}"
curl --fail --silent --show-error "http://${HOST}:${PORT}/api/tags"
echo
