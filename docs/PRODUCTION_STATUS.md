# JARVIS 0.5.1 release evidence

This is the current status authority; older session notes describe historical builds.

## Completed software work

- Original Skia/Reanimated Core retained, with operation-specific presets, visible response and Talk/Stop controls, reduced/background motion, renderer fallback.
- Structured session tool context retains weather date/unit and prayer intent across EN/AR location follow-ups. New subjects/new sessions expire incompatible context.
- Hard Local Only checked in tools, HTTP, cloud, native downloads, voice resources and network TTS; Puter WebView unmounts. Active system downloads stop (partial files may need restarting); completed models stay intact. Third-party apps/Android system services are outside the application policy.
- Qwen3 4B is the new-download default. Existing configured compatible models, including 8B and custom imports, are preserved. Model lifecycle operations serialize; download/install is single-flight.
- Tap-to-talk and push-to-interrupt retained. This is not full-duplex acoustic echo cancellation. Speaking visuals use playback activity/timing, not fabricated measured amplitude.
- Per-tool schema, network/permission/cancellation/timeout metadata in the existing registry. Tools time out/cancel without leaving the UI waiting indefinitely. Android intent dispatch is not proof of action completion.
- Diagnostics include observed device/voice/model information, measured turn latency, policy/tool counts and an executable self-test with honest PASS/FAIL/BLOCKED/SKIPPED/UNVERIFIED results.
- Release installer consumes the exact artifact manifest, verifies download SHA-256 and size, installs with data-preserving `-r`, pulls the installed base APK back for hash comparison, checks version and requests launch. Signing mismatch stops installation; no uninstall or data wipe.

## Confirmed runtime repairs

- Microphone permission removal traced to expo-image-picker configuration in the actual 0.4.1 and initial 0.5.0 APKs. Native manifest repair now restores RECORD_AUDIO, deduplicates the audio service, and separates recording/playback foreground-service types. Artifact recording rejects an APK missing microphone declarations.
- One authoritative display projection drives main Core, labels and floating Core state. Stale operation phases cannot override idle/cancelled turns. Tap-to-talk dispatches recognised text even with hands-free disabled.
- Native overlay hides while the application is foregrounded; background overlay retains bounded dragging and saved position. Cyan is normal identity; amber/red indicate warning/error.
- Microphone readiness requires actual audio frames. Capture/transcription observations are distinct diagnostics checks; audible quality and physical actions remain unverified. Advanced integrations and secrets are grouped/masked.
- Full root-cause evidence and acceptance criteria: [runtime audit](JARVIS_RUNTIME_AUDIT.md).

## Verification checkpoint

- COMPLETE: rechecked the previous repair's typecheck, lint, smoke and 612 tests before editing. The repaired source passes 619 tests; executable Python cases cover binary microphone declarations and local artifact selection. Typecheck, lint and smoke pass.
- COMPLETE: release manifest task with full JDK 17; merged manifest includes RECORD_AUDIO and one microphone/playback audio service. Final binary package inspection remains a separate gate.
- UNVERIFIED: Android runtime in this workspace; no ADB device is attached. The previous checkpoint mentioned Android 11 emulator exploration but supplied no saved runtime evidence here. Physical ROG Phone unavailable.
- UNVERIFIED: real microphone quality, audible TTS, Qwen3 4B performance/memory pressure on target phone, physical-device update survival.
- UNVERIFIED: final 0.5.1 package until recorded in `artifacts/release-manifest.json` after the native build.
- BLOCKED: production signing key is unavailable here. APK uses the same generated Expo debug certificate as the prior local 0.4.1 preview. It cannot update an installation signed with a different EAS/store certificate without that original signing key.

The APK contains the native application and bundled JS, not multi-gigabyte GGUF or speech weights. Those install once into persistent model folders. Routine in-place updates preserve app-private data too; uninstall can remove app-private data. Shared Download/JARVIS preservation requires Android storage permission.

Local Only rejects unknown/network system voices rather than silently using a network fallback. Verified Google `-local` system voices work; other voice-engine identifiers may require disabling Local Only or using downloaded on-device Kokoro (English). Live provider availability is separate from policy permission; no uptime guarantee.

## Release chain

`scripts/build-android-apk.sh` embeds the clean source commit, builds the release APK, verifies signature/alignment/native payload and runs `scripts/record-release.py`. The generated manifest records version, code, branch, commit, tree, ABI, size, SHA-256 and signing fingerprint. `scripts/install-release.py` consumes that exact manifest. Runtime observations must be added after execution, never inferred from compilation.

The follow-up recorder verifies the APK's embedded commit/version and the audio
service's own non-exported microphone/playback types. The installer prefers a
locally generated release manifest when run from a build checkout. As of this
recheck, GitHub has no published `v0.5.1-preview`; no missing release URL is
presented as an available download. The new Android version code is 2026100501.
