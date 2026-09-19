#!/usr/bin/env bash
set -euo pipefail
APK="${1:-$HOME/Downloads/app-debug.apk}"
PACKAGE="com.app.localjarviscoach"
command -v adb >/dev/null 2>&1 || { echo "adb not found"; exit 1; }
adb start-server >/dev/null
adb devices
COUNT=$(adb devices | awk '$2=="device"{n++} END{print n+0}')
[ "$COUNT" -ge 1 ] || { echo "No authorized Android device detected."; exit 1; }
[ -f "$APK" ] || { echo "APK not found: $APK"; exit 1; }
echo "Device: $(adb shell getprop ro.product.manufacturer) $(adb shell getprop ro.product.model)"
adb install -r "$APK"
adb shell pm path "$PACKAGE"
adb shell monkey -p "$PACKAGE" -c android.intent.category.LAUNCHER 1 >/dev/null
echo "JARVIS launched."
