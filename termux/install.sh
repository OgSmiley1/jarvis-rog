#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

if [ ! -d "/data/data/com.termux" ]; then
  echo "This installer must run inside Termux."
  exit 1
fi

pkg update -y
pkg install -y python git openssl

cd "$(dirname "$0")"
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt

mkdir -p runtime logs
chmod 700 runtime logs

if [ ! -f .env ]; then
  SECRET="$(openssl rand -hex 32)"
  printf 'JARVIS_IPC_SECRET=%s\n' "$SECRET" > .env
  chmod 600 .env
else
  SECRET="$(sed -n 's/^JARVIS_IPC_SECRET=//p' .env | head -n 1)"
fi

printf '\nJARVIS Termux bridge installed.\n'
printf 'Run: ./start.sh\n'
printf 'Copy this secret into JARVIS > Settings > Termux bridge:\n%s\n' "$SECRET"
