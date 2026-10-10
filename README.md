# JARVIS for Android

JARVIS is a Core-first personal assistant with an original animated Skia interface, local GGUF inference, English/Arabic voice input and speech, structured Android tools, optional free live information, and a hard Local Only policy.

**Current release: 0.5.3 preview.** See [installation and release scope](docs/RELEASE_0.5.3.md) and [production status](docs/PRODUCTION_STATUS.md). Download the APK and verification evidence from [GitHub Releases](https://github.com/OgSmiley1/jarvis-rog/releases/tag/v0.5.3-preview). Historical status files and old EAS URLs are not the current release authority.

The app detects and reuses installed models. New installations offer a one-time Qwen3 4B Q4_K_M download (~2.5 GB); existing 8B/custom models are preserved. Speech weights are separate one-time downloads. The APK therefore does not contain the entire AI brain. Models in Download/JARVIS remain there across updates; app-private files survive in-place updates but not uninstall.

Tap the Core or Talk button to speak; tap again to interrupt. Menu provides typed input, response details, history and settings. Diagnostics includes Run Self-Test. Speaking animation follows playback callbacks/timing; full-duplex microphone barge-in is not claimed.

Local Only blocks cloud AI, live providers, downloads and network voices at runtime. Installed local models, calculator, notes, timers, alarms and device actions remain available. Phone intents open Android confirmation screens where required. Optional live providers use the existing free-provider policy and fail without disabling local tools.

The release manifest is the source of truth for the APK. The installer verifies its hash, preserves app data, refuses signing mismatches and verifies the installed base APK against the downloaded artifact. Production signing credentials and physical-phone testing are external requirements; generated debug-signed previews are identified honestly.

Development uses the pinned package manager (`corepack pnpm`): `check`, `lint`, `test`, `smoke`, and `verify`. The native build entry point is `scripts/build-android-apk.sh`; verified release installation is `scripts/install-release.py`. Build artifacts/evidence are generated under `artifacts/` and published with the release, not committed into source.
