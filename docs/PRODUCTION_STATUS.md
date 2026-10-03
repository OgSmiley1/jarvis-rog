# JARVIS 0.5.0 release evidence

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

## Verification checkpoint

- COMPLETE: typecheck, existing and new automated tests (599 passed).
- PARTIAL: Android runtime verification in progress on a software Android 11 emulator with ARM64 translation. Physical ROG Phone unavailable.
- UNVERIFIED: real microphone quality, audible TTS, Qwen3 4B performance/memory pressure on target phone, physical-device update survival.
- UNVERIFIED: final 0.5.0 package until recorded in `artifacts/release-manifest.json` after the native build.
- BLOCKED: production signing key is unavailable here. APK uses the same generated Expo debug certificate as the prior local 0.4.1 preview. It cannot update an installation signed with a different EAS/store certificate without that original signing key.

The APK contains the native application and bundled JS, not multi-gigabyte GGUF or speech weights. Those install once into persistent model folders. Routine in-place updates preserve app-private data too; uninstall can remove app-private data. Shared Download/JARVIS preservation requires Android storage permission.

Local Only rejects unknown/network system voices rather than silently using a network fallback. Verified Google `-local` system voices work; other voice-engine identifiers may require disabling Local Only or using downloaded on-device Kokoro (English). Live provider availability is separate from policy permission; no uptime guarantee.

## Release chain

`scripts/build-android-apk.sh` embeds the clean source commit, builds the release APK, verifies signature/alignment/native payload and runs `scripts/record-release.py`. The generated manifest records version, code, branch, commit, tree, ABI, size, SHA-256 and signing fingerprint. `scripts/install-release.py` consumes that exact manifest. Runtime observations must be added after execution, never inferred from compilation.
