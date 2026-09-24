#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

# JARVIS ROG — everything in one go, from Termux, no PC:
#   the app, every permission, and the 2.5 GB brain put where JARVIS finds it.
# Safe to run again at any time: it resumes the brain download, skips what is
# already done, and updates the app while keeping your data.
#
# Usage:
#   bash ~/jarvis-rog/scripts/rog-setup.sh            # latest APK below
#   bash ~/jarvis-rog/scripts/rog-setup.sh <apk-url>  # a specific APK
#
# Needs: Settings -> System -> Developer options -> Wireless debugging -> ON.
# First time only it asks for the pairing code: use split screen (Termux on one
# half, "Pair device with pairing code" on the other) — the code vanishes if
# you leave that screen.

PKG="com.app.localjarviscoach"
LATEST_APK="https://expo.dev/artifacts/eas/WikoiqX3Gkuuis1YzK-vCCAcrKMJUPvNDxDB6H1pyS4.apk"
APK_URL="${1:-$LATEST_APK}"
BRAIN_NAME="Qwen3-4B-Q4_K_M.gguf"
BRAIN_URL="https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/${BRAIN_NAME}?download=true"
BRAIN_MIN_BYTES=2000000000
BRAIN_DIR="/sdcard/Android/data/${PKG}/files/models"
WORK="$HOME/jarvis-rog-setup"
mkdir -p "$WORK"

ok()   { echo "  OK    $1"; }
skip() { echo "  SKIP  $1 — $2"; }
step() { echo; echo "== $1 =="; }

command -v adb >/dev/null 2>&1 || pkg install -y android-tools
command -v curl >/dev/null 2>&1 || pkg install -y curl
# Keep Termux awake for the long brain download; released at the end.
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock || true
trap 'command -v termux-wake-unlock >/dev/null 2>&1 && termux-wake-unlock || true' EXIT

connected() { adb devices | awk 'NR>1 && $2=="device"' | grep -q .; }

step "Connecting to this phone's Wireless debugging"
if ! connected; then
  # Already paired before? Find the connect port by itself.
  found=$(adb mdns services 2>/dev/null | awk '/_adb-tls-connect/ {print $NF}' | head -1 || true)
  [ -n "$found" ] && adb connect "$found" >/dev/null 2>&1 || true
fi
if ! connected; then
  echo "Open: Developer options -> Wireless debugging -> Pair device with pairing code"
  read -r -p "Pairing port (the number after the colon): " PAIR_PORT
  read -r -p "Six-digit pairing code: " PAIR_CODE
  adb pair "127.0.0.1:${PAIR_PORT}" "${PAIR_CODE}"
  echo "Now the port on the Wireless debugging screen itself (IP address & Port)."
  read -r -p "Connect port: " CONNECT_PORT
  adb connect "127.0.0.1:${CONNECT_PORT}"
fi
connected || { echo "FAIL: not connected to Wireless debugging. Turn it off and on, then run this again."; exit 2; }
ok "connected"

step "Installing JARVIS (keeps your data)"
curl -fL --retry 3 -o "$WORK/jarvis.apk" "$APK_URL"
adb install -r -g "$WORK/jarvis.apk"
adb shell pm path "$PKG" >/dev/null || { echo "FAIL: $PKG is not installed."; exit 3; }
ok "installed"

step "Granting permissions"
# adb installs whitelist restricted permissions (SMS, call log), so pm grant works for them here.
for perm in RECORD_AUDIO POST_NOTIFICATIONS READ_CONTACTS CALL_PHONE READ_SMS READ_CALL_LOG READ_CALENDAR; do
  if adb shell pm grant "$PKG" "android.permission.$perm" 2>/dev/null; then ok "$perm"; else skip "$perm" "not requested by this build"; fi
done
adb shell appops set "$PKG" SYSTEM_ALERT_WINDOW allow 2>/dev/null && ok "display over other apps (floating orb)" || skip "display over other apps" "refused"
adb shell dumpsys deviceidle whitelist "+$PKG" >/dev/null 2>&1 && ok "battery optimisation off" || skip "battery optimisation" "refused"
adb shell cmd appops set "$PKG" RUN_ANY_IN_BACKGROUND allow 2>/dev/null && ok "run in background" || skip "run in background" "refused"
if adb shell cmd role add-role-holder android.app.role.ASSISTANT "$PKG" 0 2>/dev/null; then
  ok "default digital assistant"
else
  skip "default assistant" "set it by hand: Settings -> Apps -> Default apps -> Digital assistant app"
fi

step "The brain (Qwen3 4B, 2.5 GB, runs offline)"
# Stop the app so it cannot start its own download of the same file meanwhile.
adb shell am force-stop "$PKG" || true
on_phone=$(adb shell "stat -c %s '$BRAIN_DIR/$BRAIN_NAME' 2>/dev/null" | tr -d '\r' || true)
if [ -n "$on_phone" ] && [ "$on_phone" -ge "$BRAIN_MIN_BYTES" ]; then
  ok "already in place ($((on_phone / 1048576)) MB) — not downloading again"
else
  free_kb=$(df -k "$WORK" | awk 'NR==2 {print $4}')
  if [ "${free_kb:-0}" -lt 3000000 ]; then
    echo "FAIL: need about 3 GB free for the download (have $((free_kb / 1024)) MB). Free some space and run this again."
    exit 4
  fi
  echo "Downloading. If it stops, run this command again: it continues where it left off."
  curl -fL --retry 10 --retry-delay 5 -C - -o "$WORK/$BRAIN_NAME" "$BRAIN_URL"
  size=$(stat -c %s "$WORK/$BRAIN_NAME")
  [ "$size" -ge "$BRAIN_MIN_BYTES" ] || { echo "FAIL: download incomplete ($size bytes). Run this again to resume."; exit 5; }

  # Hugging Face publishes the file's sha256 as its ETag: check it when present.
  expected=$(curl -sIL "$BRAIN_URL" | tr -d '\r"' | awk 'tolower($1)=="x-linked-etag:" {print $2}' | tail -1 || true)
  if [ ${#expected} -eq 64 ]; then
    echo "Checking the file is intact…"
    actual=$(sha256sum "$WORK/$BRAIN_NAME" | awk '{print $1}')
    if [ "$actual" != "$expected" ]; then
      rm -f "$WORK/$BRAIN_NAME"
      echo "FAIL: the download was corrupted and has been deleted. Run this again."
      exit 6
    fi
    ok "checksum matches"
  fi

  echo "Putting it where JARVIS looks…"
  adb shell mkdir -p "$BRAIN_DIR"
  adb shell rm -f "$BRAIN_DIR/$BRAIN_NAME.part"
  adb push "$WORK/$BRAIN_NAME" "$BRAIN_DIR/$BRAIN_NAME"
  on_phone=$(adb shell "stat -c %s '$BRAIN_DIR/$BRAIN_NAME'" | tr -d '\r')
  [ "$on_phone" = "$size" ] || { echo "FAIL: copy size mismatch. Run this again."; exit 7; }
  rm -f "$WORK/$BRAIN_NAME"
  ok "brain in place ($((size / 1048576)) MB); the Termux copy is deleted to free space"
fi

step "Verifying"
adb shell dumpsys package "$PKG" | grep -o "android.permission.[A-Z_]*: granted=[a-z]*" \
  | grep -E "RECORD_AUDIO|POST_NOTIFICATIONS|READ_CONTACTS|CALL_PHONE|READ_SMS|READ_CALL_LOG|READ_CALENDAR" | sort -u || true
echo "  overlay: $(adb shell appops get "$PKG" SYSTEM_ALERT_WINDOW | tr -d '\r')"
adb shell dumpsys deviceidle whitelist | grep -q "$PKG" && echo "  battery: exempt" || echo "  battery: optimised"

step "Launching JARVIS"
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true

cat <<'NEXT'

Done. JARVIS loads the brain by itself in a few seconds — no download button.
  1. Say: "Jarvis, how much battery"  /  "Jarvis, what do I have tomorrow"
  2. Settings -> Live test link -> Start live link, so Claude can watch the test.
Run this same command again any time to update JARVIS; the brain stays.
NEXT
