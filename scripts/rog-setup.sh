#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

# JARVIS ROG — everything in one go, from Termux, no PC:
#   the app, every permission, the 2.5 GB brain and the eyes, put where JARVIS finds them.
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
LATEST_APK="https://expo.dev/artifacts/eas/TuPqVdcTlMn77N8u3RwXi11W9upHMn__4J4r6MDFxZQ.apk"
APK_URL="${1:-$LATEST_APK}"
BRAIN_NAME="Qwen3-4B-Q4_K_M.gguf"
BRAIN_URL="https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/${BRAIN_NAME}?download=true"
BRAIN_MIN_BYTES=2000000000
MODEL_DIR="/sdcard/Android/data/${PKG}/files/models"
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
for perm in RECORD_AUDIO POST_NOTIFICATIONS READ_CONTACTS READ_SMS READ_CALL_LOG READ_CALENDAR CAMERA; do
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

# put_model <file name> <url> <minimum bytes> <label>
# Downloads into Termux (resumable), checks Hugging Face's sha256, pushes it
# into JARVIS's own model folder, deletes the Termux copy. Skips what is there.
put_model() {
  local name="$1" url="$2" min="$3" label="$4"
  local on_phone size free_kb expected actual
  on_phone=$(adb shell "stat -c %s '$MODEL_DIR/$name' 2>/dev/null" | tr -d '\r' || true)
  if [ -n "$on_phone" ] && [ "$on_phone" -ge "$min" ]; then
    ok "$label already in place ($((on_phone / 1048576)) MB)"
    return 0
  fi
  free_kb=$(df -k "$WORK" | awk 'NR==2 {print $4}')
  if [ "${free_kb:-0}" -lt $((min / 1024 + 400000)) ]; then
    echo "FAIL: not enough free space for $label ($((free_kb / 1024)) MB free). Free some space and run this again."
    exit 4
  fi
  echo "Downloading $label. If it stops, run this command again: it continues where it left off."
  curl -fL --retry 10 --retry-delay 5 -C - -o "$WORK/$name" "$url"
  size=$(stat -c %s "$WORK/$name")
  [ "$size" -ge "$min" ] || { echo "FAIL: $label incomplete ($size bytes). Run this again to resume."; exit 5; }
  expected=$(curl -sIL "$url" | tr -d '\r"' | awk 'tolower($1)=="x-linked-etag:" {print $2}' | tail -1 || true)
  if [ ${#expected} -eq 64 ]; then
    actual=$(sha256sum "$WORK/$name" | awk '{print $1}')
    if [ "$actual" != "$expected" ]; then
      rm -f "$WORK/$name"
      echo "FAIL: $label was corrupted and has been deleted. Run this again."
      exit 6
    fi
    ok "$label checksum matches"
  fi
  adb shell mkdir -p "$MODEL_DIR"
  adb shell rm -f "$MODEL_DIR/$name.part"
  adb push "$WORK/$name" "$MODEL_DIR/$name"
  on_phone=$(adb shell "stat -c %s '$MODEL_DIR/$name'" | tr -d '\r')
  [ "$on_phone" = "$size" ] || { echo "FAIL: $label copy size mismatch. Run this again."; exit 7; }
  rm -f "$WORK/$name"
  ok "$label in place ($((size / 1048576)) MB)"
}

step "The brain (Qwen3 4B, 2.5 GB) and the eyes (SmolVLM2, 546 MB) — all offline"
# Stop the app so it cannot start its own download of the same files meanwhile.
adb shell am force-stop "$PKG" || true
put_model "$BRAIN_NAME" "$BRAIN_URL" "$BRAIN_MIN_BYTES" "brain"
EYES_REPO="https://huggingface.co/ggml-org/SmolVLM2-500M-Video-Instruct-GGUF/resolve/main"
put_model "mmproj-SmolVLM2-500M-Video-Instruct-Q8_0.gguf" "$EYES_REPO/mmproj-SmolVLM2-500M-Video-Instruct-Q8_0.gguf?download=true" 100000000 "eyes projector"
put_model "SmolVLM2-500M-Video-Instruct-Q8_0.gguf" "$EYES_REPO/SmolVLM2-500M-Video-Instruct-Q8_0.gguf?download=true" 400000000 "eyes"

step "Verifying"
adb shell dumpsys package "$PKG" | grep -o "android.permission.[A-Z_]*: granted=[a-z]*" \
  | grep -E "RECORD_AUDIO|POST_NOTIFICATIONS|READ_CONTACTS|READ_SMS|READ_CALL_LOG|READ_CALENDAR|CAMERA" | sort -u || true
echo "  overlay: $(adb shell appops get "$PKG" SYSTEM_ALERT_WINDOW | tr -d '\r')"
adb shell dumpsys deviceidle whitelist | grep -q "$PKG" && echo "  battery: exempt" || echo "  battery: optimised"

step "Launching JARVIS"
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true

cat <<'NEXT'

Done. JARVIS loads the brain by itself in a few seconds — no download button.
  1. Say: "Jarvis, how much battery"  /  "Jarvis, what do you see"
  2. Settings -> Live test link -> Start live link, so Claude can watch the test.
Run this same command again any time to update JARVIS; the brain stays.
NEXT
