#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

if [ ! -d "/data/data/com.termux" ]; then
  echo "This installer must run inside Termux."
  exit 1
fi

pkg update -y
pkg install -y python git

cd "$(dirname "$0")"
JARVIS_TERMUX_DIR="$(pwd)"
if [ ! -d .venv ]; then
  python -m venv .venv
fi
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt

mkdir -p runtime logs
chmod 700 runtime logs

if [ ! -f .env ]; then
  SECRET="$(python -c 'import secrets; print(secrets.token_hex(32))')"
  printf 'JARVIS_IPC_SECRET=%s\n' "$SECRET" > .env
  chmod 600 .env
else
  SECRET="$(sed -n 's/^JARVIS_IPC_SECRET=//p' .env | head -n 1)"
fi

BOOT_DIR="$HOME/.termux/boot"
BOOT_SCRIPT="$BOOT_DIR/start-jarvis.sh"
mkdir -p "$BOOT_DIR"
{
  printf '%s\n' '#!/data/data/com.termux/files/usr/bin/bash'
  printf 'cd %q\n' "$JARVIS_TERMUX_DIR"
  printf '%s\n' './start.sh'
} > "$BOOT_SCRIPT"
chmod 700 "$BOOT_SCRIPT"

printf '\nJARVIS Termux bridge installed.\n'
printf 'Run: ./start.sh\n'
printf 'Boot script prepared: %s\n' "$BOOT_SCRIPT"
printf 'Copy this secret into JARVIS > Settings > Termux bridge:\n%s\n' "$SECRET"
