# JARVIS 0.4.1 Android preview

This build starts from `feat/core-face-freeapis` (98b3b40), includes the PR #10 cancellation fixes, and applies the four supplied zero-cost/Core specifications. It is a standalone arm64 Android APK for sideload testing, not a store release. GitHub Actions billing is not involved.

## Included

- Existing Core face: procedural red/teal LED rings, spokes, particles, sweep and dark hub; interaction states and reduced-motion/background/battery handling. Speaking activity follows playback rather than the start of synthesis. Neural activity is scheduled playback, not a measured acoustic envelope.
- Offline model and phone tools remain available. CPU inference remains the default. An installed model is preserved; no silent 8B upgrade/download. Fast spoken local responses are capped at 128 generated tokens, with sentence streaming and reasoning hidden.
- Optional cloud providers use the owner's keys in secure storage. Free tiers remain subject to provider limits; no paid subscription, backend server or credential is supplied by this build. No keys are compiled into the app.
- Keyless live tools use public weather, prayer-time and Quran APIs. Timeouts, cache/validation and honest unavailable results remain in place.
- Active turn cancellation/deadlines reach local inference, cloud requests, tools and queued speech. Network reads are scoped to their turn and bounded to two concurrent reads; three tool operations per turn. Neural synthesis stays serial even when Stop occurs mid-forward, with two scheduled clips maximum.
- Battery/connectivity subscriptions stop safely when their component disappears. Microphone permission completion cannot resurrect a stopped recording.

## Rebuild without GitHub Actions

Install Java JDK 17+ (21 used here), Android SDK platform/build-tools 36, NDK 27.1.12297006 and 27.0.12077973 (ExecuTorch), CMake 3.22.1, Node and Corepack. Native builds need several GB RAM and disk space.

```sh
CI=true RNLLAMA_SKIP_POSTINSTALL=1 corepack pnpm install --frozen-lockfile
corepack pnpm verify --report artifacts/software-verification.json
ANDROID_HOME=/path/to/android-sdk bash scripts/build-android-apk.sh
```

The build script restores only Android's official llama.rn binary artifact, verifies its pinned SHA-256, prebuilds Android and assembles release with the embedded JS bundle. It explicitly sets `rnllamaBuildFromSource=false`: the dependency defaults to true, which otherwise recompiles all selected engine variants even after restoring the official binaries. Only the React Native JNI bridges need compilation. An optional `GRADLE_BIN` selects a locally downloaded Gradle 8.14.3. `JARVIS_BUILD_CACHE` selects the artifact cache. For proxied networks, curl uses inherited proxy settings; configure Gradle's own proxy separately. This workspace also uses Google's public Maven Central mirror to overcome upstream HTTP 429 errors. Neither network workaround belongs in the mobile application's runtime.

The generated Expo debug certificate signs this preview. An existing installation signed with a different key cannot be updated with it. Preserve/export app data before considering a fresh installation; do not uninstall automatically. Reuse the original signing key for an in-place update or production release.

## Device acceptance still required

1. Launch Core, verify idle/listening/thinking/playback states and Stop during both synthesis and a live request.
2. Ask weather in Ajman, prayer times and an exact Quran verse; disconnect internet and confirm an honest cached/unavailable result.
3. Load the existing local model with CPU defaults. Record cold/warm first-token and first-audio latency from real runs; confirm Arabic/English replies contain no reasoning.
4. Test microphone permissions, navigation, background/resume, battery saver and repeated interruptions. Confirm no extra recordings, overlapping voices or stale replies.
5. Measure thermals, memory and animation frame rate on the ROG before enabling acceleration or duplex audio.

Full duplex/AEC, Silero integration, optional translation/URL-shortening providers, DSP/GPU acceleration, real speaker-envelope animation and physical-phone performance are not claimed as completed. Keep unproven acceleration and duplex paths disabled. No PR is merged and no store release is published by these scripts.
