# JARVIS Build State

## CURRENT OBJECTIVE
Produce a verified Android build candidate for ASUS ROG Phone 8 Pro while preserving the local-first Local Jarvis Coach architecture and package ID `com.app.localjarviscoach`.

## CURRENT PHASE
Phase 1/2 — Core stability, continuity, and optional keyless online-model integration. Build 0.3.0 source candidate created.

## SOURCE BASELINE
Production pack baseline commit in this working build: `d064589`.
Build 0.2.0 core-stability commit: `8c765e9`.
Existing project checkpoint reported by the dossier: `aeaff2dc`.

## COMPLETED IN BUILD 0.2.0
- Added explicit `react-native-audio-api` Expo plugin configuration with background microphone service disabled.
- Reworked live voice session cleanup so Start returns after recording begins and stream consumption runs independently.
- Added stale-session guards and reliable recorder/stream cleanup on Stop/background/unmount.
- Added asynchronous GGUF copy path for large model files plus copy-size verification and available-storage guard.
- Added native GGUF validation before accepting a newly imported model in Settings.
- Added startup database/runtime gate with retry instead of rendering through initialization failure.
- Added real slash navigation for `/analyse`, `/draft`, `/plan`, `/project`, `/memory`, `/status`.
- Added chat auto-title, new-chat flow and delete-current-chat flow.
- Added project activate/pause/complete/delete controls.
- Added step running/success/failed/retry lifecycle.
- Persisted project `lastCompletedStep` and `nextAction` from actual step state.
- Added Termux bridge diagnostics and recent audited tool-run display.
- Added default intelligence-mode controls and improved model/runtime diagnostics.
- Added structured-output fallback in Understand so useful model output is not discarded solely for formatting drift.
- Added more continuity and command-router tests.

## VERIFIED IN THIS ENVIRONMENT
- TypeScript/TSX syntax parse: PASS (53 source/test files).
- Pure core runtime assertions: PASS (routing, continuity derivation, structured parser, prompt isolation, nonblank completion).
- Python `py_compile`: PASS for Termux bridge.
- Shell `bash -n`: PASS for Termux/scripts shell files.
- JSON parse: PASS for schemas/package/eas files.
- Existing smoke-test file-presence gate: PASS.

## BLOCKED IN THIS ENVIRONMENT
- `pnpm install` / dependency resolution: package registry DNS/network unavailable in the build container.
- Full Expo TypeScript check: requires project dependencies.
- Expo lint and Vitest suite: requires project dependencies.
- `expo prebuild`: requires installed Expo/native dependencies.
- Gradle APK compile: requires generated Android project and Android/Gradle dependency resolution.
- Physical ROG Phone tests: require the owner's device and an actual GGUF.

## FAILED ATTEMPTS
- `corepack pnpm` attempted; failed with `EAI_AGAIN registry.npmjs.org`.
- `scripts/verify-project.mjs` cannot proceed because pnpm is unavailable for the same reason.

## NEXT EXACT ACTION
On a networked build machine or Claude Code environment:
1. `corepack enable`
2. `corepack prepare pnpm@10.15.0 --activate`
3. `pnpm install`
4. `pnpm check`
5. `pnpm lint`
6. `pnpm test`
7. `pnpm prebuild:android`
8. `cd android && ./gradlew assembleDebug`
9. Fix every real compile failure without weakening strictness or replacing native functionality with mocks.
10. Install resulting APK on ASUS ROG Phone 8 Pro and execute `docs/ACCEPTANCE_TESTS.md`.

## BUILD 0.3.0 — ONLINE MODEL HUB

### Completed in source
- Added optional keyless Online Models Hub.
- Added browser-side Puter.js gateway via React Native WebView.
- Added explicit in-WebView user authentication; JARVIS stores no provider API key.
- Added dynamic live model list and provider grouping.
- Added Free-only guard using live `:free` model metadata.
- Added online chat streaming and local SQLite persistence.
- Added official ChatGPT/Gemini/Grok consumer-web fallbacks.
- Added online-model catalog tests and docs.

### Critical truth boundary
No claim of physical Android WebView auth success has been made yet. That must be validated on the ROG Phone. No claim is made that all hosted models are unlimited free; Puter free allowance and provider free-variant quotas can change.

### Next exact action
Run dependency install, TypeScript, lint, Vitest, Expo prebuild and Gradle. Then install on ASUS ROG Phone 8 Pro and validate embedded Puter authentication + free model streaming.
