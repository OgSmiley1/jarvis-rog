#!/usr/bin/env bash
set -euo pipefail

COMMIT="${1:-b9c88cb40f702cbf4b03bc50e672dfc673b7e284}"
PKG="com.app.localjarviscoach"
OUT_DIR="${PWD}/artifacts/rog-validation"
TMP_DIR="${OUT_DIR}/tmp"
mkdir -p "$OUT_DIR" "$TMP_DIR"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1"
    exit 1
  }
}

need adb
need node
need npx
need unzip

echo "== JARVIS ROG exact EAS build validation =="
echo "Commit: $COMMIT"
echo "Package: $PKG"

echo "== Checking device =="
adb get-state >/dev/null
adb devices -l

echo "== Finding successful EAS Android build for exact commit =="
BUILD_JSON="$OUT_DIR/build-list.json"
npx --yes eas-cli@latest build:list \
  --platform android \
  --status finished \
  --git-commit-hash "$COMMIT" \
  --limit 10 \
  --json \
  --non-interactive > "$BUILD_JSON"

BUILD_ID="$(node - "$BUILD_JSON" <<'NODE'
const fs = require('fs');
const p = process.argv[2];
const data = JSON.parse(fs.readFileSync(p, 'utf8'));
const list = Array.isArray(data) ? data : (data.builds || data.items || []);
const build = list.find(b => String(b.platform || '').toLowerCase() === 'android') || list[0];
if (!build?.id) process.exit(2);
process.stdout.write(build.id);
NODE
)" || {
  echo "No finished Android EAS build found for $COMMIT"
  exit 2
}

echo "Build ID: $BUILD_ID"

rm -f "$TMP_DIR"/*.apk
(
  cd "$TMP_DIR"
  npx --yes eas-cli@latest build:download \
    --build-id "$BUILD_ID" \
    --non-interactive
)

APK="$(find "$TMP_DIR" -maxdepth 2 -type f -name '*.apk' -print -quit)"
if [ -z "${APK:-}" ] || [ ! -f "$APK" ]; then
  echo "EAS download completed but no APK was found."
  exit 3
fi

FINAL_APK="$OUT_DIR/JARVIS-ROG-${COMMIT:0:12}.apk"
cp "$APK" "$FINAL_APK"

echo "== APK integrity =="
ls -lh "$FINAL_APK"
if command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "$FINAL_APK" | tee "$OUT_DIR/apk-sha256.txt"
elif command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$FINAL_APK" | tee "$OUT_DIR/apk-sha256.txt"
fi

ABI_DIRS="$(unzip -Z1 "$FINAL_APK" | awk -F/ '/^lib\/[^/]+\// {print $2}' | sort -u)"
echo "APK native ABIs:"
echo "$ABI_DIRS"
if ! echo "$ABI_DIRS" | grep -qx 'arm64-v8a'; then
  echo "FAIL: arm64-v8a is missing from APK."
  exit 4
fi

EXTRA_ABIS="$(echo "$ABI_DIRS" | grep -v '^arm64-v8a$' || true)"
if [ -n "$EXTRA_ABIS" ]; then
  echo "NOTE: APK contains additional ABIs:"
  echo "$EXTRA_ABIS"
fi

for required in \
  'assets/index.android.bundle' \
  'lib/arm64-v8a/libreact-native-executorch.so' \
  'lib/arm64-v8a/libexecutorch.so' \
  'lib/arm64-v8a/libreact-native-audio-api.so'
do
  if ! unzip -Z1 "$FINAL_APK" | grep -Fx "$required" >/dev/null; then
    echo "FAIL: missing $required"
    exit 5
  fi
done

if ! unzip -Z1 "$FINAL_APK" | grep '^lib/arm64-v8a/librnllama' >/dev/null; then
  echo "FAIL: no arm64 librnllama library found."
  exit 6
fi

echo "APK integrity: PASS"

echo "== Installing exact APK =="
adb install -r -d "$FINAL_APK" | tee "$OUT_DIR/adb-install.txt"

echo "== Installed package verification =="
adb shell dumpsys package "$PKG" > "$OUT_DIR/package.txt"
grep -E 'versionName=|versionCode=|primaryCpuAbi=|secondaryCpuAbi=' "$OUT_DIR/package.txt" || true

echo "== Cold launch runtime check =="
adb logcat -c
adb shell am force-stop "$PKG"
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 > "$OUT_DIR/launch.txt" 2>&1 || true
sleep 8

PID="$(adb shell pidof "$PKG" | tr -d '\r' || true)"
adb shell dumpsys activity exit-info "$PKG" > "$OUT_DIR/exit-info.txt" 2>&1 || true
adb logcat -d -b crash -v threadtime > "$OUT_DIR/crash.txt" 2>&1 || true
adb logcat -d -v threadtime > "$OUT_DIR/logcat.txt" 2>&1 || true
grep -Eai \
  'FATAL EXCEPTION|AndroidRuntime|UnsatisfiedLinkError|dlopen|SIGSEGV|SIGABRT|SoLoader|ReactNativeJS|ReactNative|ExecuTorch|llama|AudioAPI|localjarviscoach|jarvis' \
  "$OUT_DIR/logcat.txt" > "$OUT_DIR/focus.txt" || true

if [ -z "$PID" ]; then
  echo
  echo "RUNTIME: FAIL — JARVIS process is not alive after cold launch."
  echo "First focused lines:"
  head -80 "$OUT_DIR/focus.txt" || true
  echo
  echo "Full diagnostics saved in: $OUT_DIR"
  exit 10
fi

echo "RUNTIME: PASS — process alive, pid=$PID"

echo "== UI snapshot =="
adb shell uiautomator dump /sdcard/jarvis-window.xml >/dev/null 2>&1 || true
adb pull /sdcard/jarvis-window.xml "$OUT_DIR/window.xml" >/dev/null 2>&1 || true
adb exec-out screencap -p > "$OUT_DIR/jarvis-launch.png" || true

echo
echo "SUCCESS"
echo "Exact EAS commit: $COMMIT"
echo "Build ID: $BUILD_ID"
echo "APK: $FINAL_APK"
echo "Diagnostics: $OUT_DIR"
echo "Next physical checks: microphone -> voice -> Maps -> Photos -> YouTube -> Gmail -> background -> airplane-mode local brain."
