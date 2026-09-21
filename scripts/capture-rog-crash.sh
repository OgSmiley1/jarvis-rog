#!/usr/bin/env bash
set -euo pipefail

PKG="com.app.localjarviscoach"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="jarvis-crash-\${STAMP}"

mkdir -p "$OUT"

echo "== Checking ADB =="
adb get-state >/dev/null
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

cat "$OUT/focus.txt"
echo
echo "Saved diagnostics to: $OUT"
