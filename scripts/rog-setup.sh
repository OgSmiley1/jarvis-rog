#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

# JARVIS ROG — install an APK and grant everything JARVIS needs, from Termux,
# with no PC. It talks to the phone's own Wireless debugging over localhost.
#
# Usage:
#   ./scripts/rog-setup.sh <apk-url>     # download, install, grant, launch
#   ./scripts/rog-setup.sh               # grant + launch the installed app
#
# One-time pairing (the script walks you through it):
#   Settings -> System -> Developer options -> Wireless debugging -> ON
#   -> "Pair device with pairing code". Use split screen: Termux on one half,
#   the pairing dialog on the other, because the code vanishes if you leave it.

PKG="com.app.localjarviscoach"
APK_URL="${1:-}"
WORK="$HOME/jarvis-rog-setup"
mkdir -p "$WORK"

command -v adb >/dev/null 2>&1 || pkg install -y android-tools
command -v curl >/dev/null 2>&1 || pkg install -y curl

connected() {
  adb devices | awk 'NR>1 && $2=="device"' | grep -q .
}

if ! connected; then
  echo "== Pair with this phone's Wireless debugging =="
  echo "Open: Developer options -> Wireless debugging -> Pair device with pairing code"
  read -r -p "Pairing port (the number after the colon): " PAIR_PORT
  read -r -p "Six-digit pairing code: " PAIR_CODE
  adb pair "127.0.0.1:${PAIR_PORT}" "${PAIR_CODE}"
  echo
  echo "Now the port shown on the Wireless debugging screen itself (IP address & Port)."
  read -r -p "Connect port: " CONNECT_PORT
  adb connect "127.0.0.1:${CONNECT_PORT}"
fi

connected || { echo "FAIL: not connected to Wireless debugging."; exit 2; }
adb devices -l

if [ -n "$APK_URL" ]; then
  echo "== Downloading JARVIS =="
  curl -fL --retry 3 -o "$WORK/jarvis.apk" "$APK_URL"
  ls -lh "$WORK/jarvis.apk"
  echo "== Installing (keeps your data) =="
  adb install -r -g "$WORK/jarvis.apk"
fi

adb shell pm path "$PKG" >/dev/null || { echo "FAIL: $PKG is not installed."; exit 3; }

ok()   { echo "  OK    $1"; }
skip() { echo "  SKIP  $1 — $2"; }

echo "== Granting permissions =="
# adb installs whitelist restricted permissions (SMS, call log), so pm grant works for them here.
for perm in android.permission.RECORD_AUDIO android.permission.POST_NOTIFICATIONS \
  android.permission.READ_CONTACTS android.permission.CALL_PHONE android.permission.READ_SMS \
  android.permission.READ_CALL_LOG android.permission.READ_CALENDAR; do
  if adb shell pm grant "$PKG" "$perm" 2>/dev/null; then ok "$perm"; else skip "$perm" "not requested by this build"; fi
done

# Floating orb: "Display over other apps".
if adb shell appops set "$PKG" SYSTEM_ALERT_WINDOW allow 2>/dev/null; then ok "display over other apps"; else skip "display over other apps" "refused"; fi

# Keep the wake-word loop alive: no battery-optimisation kills, background allowed.
if adb shell dumpsys deviceidle whitelist "+$PKG" >/dev/null 2>&1; then ok "battery optimisation off"; else skip "battery optimisation" "refused"; fi
adb shell cmd appops set "$PKG" RUN_ANY_IN_BACKGROUND allow 2>/dev/null && ok "run in background" || skip "run in background" "refused"

# Long-press home opens JARVIS. Android only accepts this if the build declares
# an assistant entry point; it says so plainly if not.
if adb shell cmd role add-role-holder android.app.role.ASSISTANT "$PKG" 0 2>/dev/null; then
  ok "default digital assistant"
else
  skip "default assistant" "set it by hand: Settings -> Apps -> Default apps -> Digital assistant app"
fi

echo "== Verifying =="
adb shell dumpsys package "$PKG" | grep -E "RECORD_AUDIO|POST_NOTIFICATIONS|READ_CONTACTS|CALL_PHONE|READ_SMS|READ_CALL_LOG|READ_CALENDAR" | grep -o "android.permission.[A-Z_]*: granted=[a-z]*" | sort -u || true
echo "  overlay: $(adb shell appops get "$PKG" SYSTEM_ALERT_WINDOW | tr -d '\r')"
adb shell dumpsys deviceidle whitelist | grep -q "$PKG" && echo "  battery: exempt" || echo "  battery: optimised"

echo "== Launching JARVIS =="
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true

cat <<'NEXT'

Done. In JARVIS:
  1. Orb -> "Download JARVIS brain" (2.5 GB, once) if it asks.
  2. Settings -> Live test link -> Start live link. The red LIVE badge appears.
  3. Talk to it: "Jarvis, what time is it."
NEXT
