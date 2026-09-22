#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

VALIDATION_COMMIT="e6e024633e60112712b1bdb8163aa049ae774416"
OUT_DIR="$HOME/jarvis-rog/artifacts/phone-install"
TMP_DIR="$OUT_DIR/tmp"
mkdir -p "$OUT_DIR" "$TMP_DIR"

echo "== JARVIS ROG phone-only installer =="
echo "Exact validated build commit: $VALIDATION_COMMIT"
echo

need_pkg() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Installing missing package: $2"
    pkg install -y "$2"
  fi
}

need_pkg node nodejs-lts
need_pkg npx nodejs-lts
need_pkg unzip unzip
need_pkg termux-open termux-tools

cd "$HOME/jarvis-rog"

echo "== Checking Expo/EAS login =="
if ! npx --yes eas-cli@latest whoami >/tmp/jarvis-eas-whoami.txt 2>&1; then
  echo
  cat /tmp/jarvis-eas-whoami.txt || true
  echo
  echo "Expo login is required once on this phone."
  echo "Run:"
  echo "  npx --yes eas-cli@latest login"
  echo "Then rerun:"
  echo "  ./scripts/install-fixed-on-phone.sh"
  exit 20
fi
cat /tmp/jarvis-eas-whoami.txt || true

echo "== Finding successful EAS Android build =="
BUILD_JSON="$OUT_DIR/build-list.json"
if ! npx --yes eas-cli@latest build:list \
  --platform android \
  --status finished \
  --git-commit-hash "$VALIDATION_COMMIT" \
  --limit 10 \
  --json \
  --non-interactive > "$BUILD_JSON" 2>"$OUT_DIR/build-list-error.txt"; then
  echo
  echo "FAIL: EAS build lookup failed."
  cat "$OUT_DIR/build-list-error.txt" || true
  echo
  echo "Try these two commands:"
  echo "  npx --yes eas-cli@latest whoami"
  echo "  npx --yes eas-cli@latest build:list --platform android --status finished --limit 3"
  exit 21
fi

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
  echo "FAIL: no successful Android EAS build found for $VALIDATION_COMMIT"
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
  echo "FAIL: EAS download finished but no APK was found."
  exit 3
fi

FINAL_APK="$OUT_DIR/JARVIS-ROG-fixed.apk"
cp "$APK" "$FINAL_APK"

echo
echo "== APK integrity =="
ls -lh "$FINAL_APK"
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$FINAL_APK" | tee "$OUT_DIR/apk-sha256.txt"
else
  shasum -a 256 "$FINAL_APK" | tee "$OUT_DIR/apk-sha256.txt"
fi

ABI_DIRS="$(unzip -Z1 "$FINAL_APK" | awk -F/ '/^lib\/[^/]+\// {print $2}' | sort -u)"
echo "ABIs:"
echo "$ABI_DIRS"
echo "$ABI_DIRS" | grep -qx 'arm64-v8a' || {
  echo "FAIL: arm64-v8a missing."
  exit 4
}

for required in \
  'assets/index.android.bundle' \
  'lib/arm64-v8a/libreact-native-executorch.so' \
  'lib/arm64-v8a/libexecutorch.so' \
  'lib/arm64-v8a/libreact-native-audio-api.so'
do
  unzip -Z1 "$FINAL_APK" | grep -Fx "$required" >/dev/null || {
    echo "FAIL: missing $required"
    exit 5
  }
done

unzip -Z1 "$FINAL_APK" | grep '^lib/arm64-v8a/librnllama' >/dev/null || {
  echo "FAIL: arm64 llama.rn library missing."
  exit 6
}

echo "APK integrity: PASS"
echo
echo "Opening Android package installer..."
echo "If Android blocks it: Settings -> Apps -> Special app access -> Install unknown apps -> Termux -> Allow."
echo

termux-open --view "$FINAL_APK"

echo
echo "Installer launched."
echo "Tap Install on Android, then Open."
echo "APK kept at: $FINAL_APK"
