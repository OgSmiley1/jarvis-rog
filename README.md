# JARVIS 0.5.5 arm64 release artifact

This branch contains the corrected sideloadable APK and build evidence produced from `main`.

Immutable artifact ref: `apk-0.5.5-r1`.

- APK: `Jarvis-0.5.5-arm64.apk`
- Package/version: `com.app.localjarviscoach` / `0.5.5` (`versionCode 2026101003`)
- Source commit: `1f0d5ff1aae07ee528e6fb6a8ffc89ccdbbfdfc7`
- SHA-256: `aec3caf142a09266ed22fa47d4f7f4790a7788017fcab4cec50b6d820b609853`
- ABI: `arm64-v8a`
- Signing: Expo debug certificate for sideload preview

The APK includes `RECORD_AUDIO` and `FOREGROUND_SERVICE_MICROPHONE`. Install it, grant microphone access, then configure the optional loopback Ollama provider in JARVIS settings. The embedded GGUF brain remains the primary offline path.

Phone installation from Termux:

```sh
python install-on-termux.py
```

The APK was build-verified in this workspace. Physical phone installation, microphone capture, and Ollama `/api/tags` remain device-side checks and are not claimed here because no ADB device is attached to this workspace.
