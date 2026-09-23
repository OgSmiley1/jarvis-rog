#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

# JARVIS ROG — phone-only build and install.
#
# This runs entirely from Termux on the ROG Phone. It does not touch GitHub
# Actions, whose runners are blocked account-wide (every run, including a
# one-line `echo`, fails in ~3s with runner_id 0 and no log). EAS builds in
# Expo's own cloud, so this path is independent of that block.
#
# Previously this script could only DOWNLOAD a finished build, pinned to one
# hardcoded commit. If no such build existed — which was always — it failed
# with nothing to do about it. It now builds the commit you actually have
# checked out, waits for it, then verifies and installs it.
#
# Usage:
#   ./scripts/install-fixed-on-phone.sh              # build + install HEAD
#   ./scripts/install-fixed-on-phone.sh <commit-sha> # use an existing build
#   NO_BUILD=1 ./scripts/install-fixed-on-phone.sh   # download only, never build

OUT_DIR="$HOME/jarvis-rog/artifacts/phone-install"
TMP_DIR="$OUT_DIR/tmp"
mkdir -p "$OUT_DIR" "$TMP_DIR"

cd "$HOME/jarvis-rog"

TARGET_COMMIT="${1:-$(git rev-parse HEAD)}"
EAS="npx --yes eas-cli@latest"

echo "== JARVIS ROG phone-only build and install =="
echo "Target commit: $TARGET_COMMIT"
echo "Branch:        $(git rev-parse --abbrev-ref HEAD)"
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
need_pkg git git
need_pkg termux-open termux-tools

echo "== Checking Expo/EAS login =="
if ! $EAS whoami >/tmp/jarvis-eas-whoami.txt 2>&1; then
  echo "Expo/EAS is not logged in on this phone."
  echo "Opening the official browser login now..."
  echo
  if ! $EAS login --browser; then
    echo
    echo "FAIL: Expo browser login did not complete."
    echo "Keep this Termux session open, finish login in the browser, then rerun:"
    echo "  ./scripts/install-fixed-on-phone.sh"
    exit 20
  fi
  echo
  echo "Login completed. Verifying account..."
  $EAS whoami | tee /tmp/jarvis-eas-whoami.txt
else
  cat /tmp/jarvis-eas-whoami.txt || true
fi

ACCOUNT="$(tr -d '[:space:]' </tmp/jarvis-eas-whoami.txt || true)"
CONFIGURED_OWNER="$(node -e "process.stdout.write(require('fs').readFileSync('app.config.ts','utf8').match(/owner:\s*'([^']+)'/)?.[1] ?? '')" 2>/dev/null || true)"
echo "Signed in as: ${ACCOUNT:-unknown}"
echo "Project owner in app.config.ts: ${CONFIGURED_OWNER:-unset}"
echo

find_finished_build() {
  $EAS build:list \
    --platform android \
    --status finished \
    --git-commit-hash "$TARGET_COMMIT" \
    --limit 10 \
    --json \
    --non-interactive 2>"$OUT_DIR/build-list-error.txt" \
  | node -e '
      let raw = "";
      process.stdin.on("data", (chunk) => { raw += chunk; });
      process.stdin.on("end", () => {
        let data;
        try { data = JSON.parse(raw); } catch { process.exit(2); }
        const list = Array.isArray(data) ? data : (data.builds || data.items || []);
        const build = list.find((b) => String(b.platform || "").toLowerCase() === "android") || list[0];
        if (!build?.id) process.exit(2);
        process.stdout.write(build.id);
      });
    '
}

echo "== Looking for a finished EAS Android build for this commit =="
BUILD_ID="$(find_finished_build || true)"

if [ -z "${BUILD_ID:-}" ]; then
  if [ "${NO_BUILD:-0}" = "1" ]; then
    echo "FAIL: no finished build for $TARGET_COMMIT, and NO_BUILD=1 was set."
    cat "$OUT_DIR/build-list-error.txt" 2>/dev/null || true
    exit 2
  fi

  echo "None found. Starting one now in Expo's cloud."
  echo "This is free on the EAS free tier and typically takes 15-35 minutes,"
  echo "including queue time. Keep Termux awake (termux-wake-lock) and leave"
  echo "this session open."
  echo

  command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock || true

  if ! $EAS build \
    --platform android \
    --profile preview \
    --non-interactive \
    --wait 2>&1 | tee "$OUT_DIR/build-log.txt"
  then
    echo
    echo "FAIL: the EAS build did not complete. Full output: $OUT_DIR/build-log.txt"
    echo
    if grep -qi 'account not found\|does not have access\|not authorized\|project.*not found' "$OUT_DIR/build-log.txt"; then
      cat <<REMEDY
This is an ACCOUNT ACCESS failure, not a code failure.

app.config.ts points at owner '${CONFIGURED_OWNER:-unset}' and EAS project
eda56376-aa74-45d7-b652-68d661a9da9e. The account you are signed in as
(${ACCOUNT:-unknown}) cannot reach it.

Two ways forward:

  1. Sign in as the account that owns '${CONFIGURED_OWNER:-unset}':
       $EAS logout && $EAS login

  2. Build under YOUR OWN account instead. This creates a new EAS project
     and rewrites the owner/projectId in app.config.ts:
       $EAS init --force
       ./scripts/install-fixed-on-phone.sh

     The APK is identical either way. The package id stays
     com.app.localjarviscoach, so it installs over any previous build.
     Commit the app.config.ts change afterwards so it is not lost.
REMEDY
    fi
    exit 22
  fi

  echo
  echo "Build finished. Locating the artifact..."
  BUILD_ID="$(find_finished_build || true)"
  if [ -z "${BUILD_ID:-}" ]; then
    echo "FAIL: the build reported success but no finished build matches $TARGET_COMMIT."
    echo "Check https://expo.dev and run: $EAS build:list --platform android --limit 3"
    exit 23
  fi
fi

echo "Build ID: $BUILD_ID"

rm -f "$TMP_DIR"/*.apk
(
  cd "$TMP_DIR"
  $EAS build:download --build-id "$BUILD_ID" --non-interactive
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

# A green build is not proof that JARVIS shipped. Each of these has silently
# gone missing before while Gradle still reported success.
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
  echo "FAIL: arm64 llama.rn library missing — the APK would install and launch with no local inference."
  exit 6
}

echo "APK integrity: PASS"
echo
echo "Opening Android package installer..."
echo "If Android blocks it: Settings -> Apps -> Special app access -> Install unknown apps -> Termux -> Allow."
echo

termux-open --view "$FINAL_APK"

command -v termux-wake-unlock >/dev/null 2>&1 && termux-wake-unlock || true

cat <<'NEXT'

Installer launched. Tap Install, then Open.

After it opens, to make JARVIS ambient:
  Settings -> Apps -> Default apps -> Digital assistant app -> JARVIS ROG
Long-press home then opens the orb over whatever app you are in.

If the orb says OFFLINE, no local model is loaded yet:
  gear icon -> Download recommended model (Qwen3-4B, ~2.5 GB, one tap)
NEXT
