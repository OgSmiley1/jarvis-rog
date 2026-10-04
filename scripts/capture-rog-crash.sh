#!/usr/bin/env bash
set -euo pipefail

PKG="com.app.localjarviscoach"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="jarvis-crash-${STAMP}"

mkdir -p "$OUT"

command -v adb >/dev/null 2>&1 || pkg install -y android-tools

echo "== Connecting to Wireless debugging =="
connected() { adb devices | awk 'NR>1 && $2=="device"' | grep -q .; }
if ! connected; then
  found=$(adb mdns services 2>/dev/null | awk '/_adb-tls-connect/ {print $NF}' | head -1 || true)
  [ -n "$found" ] && adb connect "$found" >/dev/null 2>&1 || true
fi
if ! connected; then
  echo "Open: Developer options -> Wireless debugging (keep that screen open)."
  read -r -p "Connect port shown under 'IP address & Port': " CONNECT_PORT
  adb connect "127.0.0.1:${CONNECT_PORT}" || true
fi
connected || { echo "Not connected. Turn Wireless debugging off and on, then run this again."; exit 2; }
adb devices -l | tee "$OUT/devices.txt"

echo "== Device =="
{
  echo "MODEL=$(adb shell getprop ro.product.model | tr -d '\r')"
  echo "ANDROID=$(adb shell getprop ro.build.version.release | tr -d '\r')"
  echo "SDK=$(adb shell getprop ro.build.version.sdk | tr -d '\r')"
  echo "ABI=$(adb shell getprop ro.product.cpu.abilist | tr -d '\r')"
} | tee "$OUT/device.txt"

adb shell dumpsys package "$PKG" > "$OUT/package.txt"

echo "== Clearing logcat and launching JARVIS =="
adb logcat -c
adb shell am force-stop "$PKG"
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 > "$OUT/launch.txt" 2>&1 || true
sleep 6
echo
echo ">>> JARVIS is open. Now do exactly what does not work (tap the Core, speak, ask something)."
read -r -p ">>> Press Enter here when it has failed... " _ || true

echo "== Exit information =="
adb shell dumpsys activity exit-info "$PKG" > "$OUT/exit-info.txt" 2>&1 || true

echo "== Crash buffer =="
adb logcat -d -b crash -v threadtime > "$OUT/crash.txt" 2>&1 || true

echo "== Complete log =="
adb logcat -d -v threadtime > "$OUT/logcat.txt" 2>&1 || true

echo "== Focused failure lines =="
grep -Eai \
  'FATAL EXCEPTION|AndroidRuntime|UnsatisfiedLinkError|dlopen|SIGSEGV|SIGABRT|SoLoader|ReactNativeJS|ReactNative|ExecuTorch|llama|AudioAPI|localjarviscoach|jarvis' \
  "$OUT/logcat.txt" > "$OUT/focus.txt" || true

echo
echo "================ SEND THIS PART TO CLAUDE ================"
echo "--- device ---"; cat "$OUT/device.txt"
echo "--- installed version ---"; grep -m2 -E "versionName|versionCode" "$OUT/package.txt" || true
echo "--- last exit ---"; grep -m6 -E "reason|description|importance" "$OUT/exit-info.txt" || true
echo "--- crash buffer ---"; tail -n 40 "$OUT/crash.txt"
echo "--- app log (last 60) ---"; grep -Eai "ReactNativeJS|FATAL|AndroidRuntime|UnsatisfiedLinkError|SIGSEGV|SIGABRT|llama|ExecuTorch|AudioAPI|skia|localjarviscoach" "$OUT/logcat.txt" | tail -n 60 || true
echo "=========================================================="
echo "Full logs saved in: $(pwd)/$OUT"
