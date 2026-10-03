#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${ANDROID_HOME:?Set ANDROID_HOME to your installed Android SDK}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export JARVIS_BUILD_COMMIT="$(git rev-parse HEAD)"
node scripts/restore-android-native-libs.mjs
corepack pnpm exec expo prebuild --platform android --no-install
printf 'sdk.dir=%s\n' "$ANDROID_HOME" > android/local.properties
if [[ -n "${GRADLE_BIN:-}" ]]; then
  gradle_cmd="$GRADLE_BIN"
else
  gradle_cmd="$PWD/android/gradlew"
fi
# Release optimization and an embedded JS bundle; Expo's generated debug
# certificate is used for sideload testing. This is not a store release.
(cd android && "$gradle_cmd" :app:assembleRelease -PreactNativeArchitectures=arm64-v8a -PrnllamaBuildFromSource=false \
  '-Dorg.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=768m -Dfile.encoding=UTF-8' \
  --max-workers=2 --no-daemon --console=plain)
version=$(node -p "require('./package.json').version")
mkdir -p artifacts
cp android/app/build/outputs/apk/release/app-release.apk "artifacts/Jarvis-${version}-arm64.apk"
"$ANDROID_HOME/build-tools/36.0.0/apksigner" verify --verbose "artifacts/Jarvis-${version}-arm64.apk"
sha256sum "artifacts/Jarvis-${version}-arm64.apk"

python3 scripts/record-release.py "artifacts/Jarvis-${version}-arm64.apk"
