# JARVIS ROG — LIVE BUILD STATE

## CURRENT OBJECTIVE

Produce a verified, installable Android APK for the ASUS ROG Phone 8 Pro while preserving the local-first JARVIS architecture and package ID `com.app.localjarviscoach`.

Do not restart the project. Continue from the latest unfinished gate.

## CURRENT PHASE

**Build 0.4.0 — Real Android build + device validation.**

The application source is already substantially implemented. The work now is not another architecture rewrite. The immediate job is to make the existing source compile into a real APK, then validate its real local-AI, voice, memory, continuity, tools, and optional online-model paths on the physical ASUS ROG Phone 8 Pro.

## LIVE REPOSITORY

- Repository: `OgSmiley1/jarvis-rog`
- Default branch: `main`
- Expo owner/project: `@smiley007s-team/smiley`
- EAS project ID: `eda56376-aa74-45d7-b652-68d661a9da9e`
- Android package: `com.app.localjarviscoach`
- Expo SDK 54
- React Native 0.81
- React 19
- TypeScript
- pnpm 10.15.0
- Node >= 20.19.0

## LATEST BUILD-INFRA CHECKPOINTS

- `e04473e` — Expo onboarding workflow added.
- `761fb23` — malformed GitHub Actions trigger repaired.
- `5ee3d3a` — GitHub Android verification build enabled on pushes to `main`.

The GitHub Android workflow now has valid YAML and runs both manually and on pushes to `main`.

## VERIFIED DEVICE BASELINE

Already established before this checkpoint:

- ASUS ROG Phone 8 Pro / AI2401
- Android 16 / API 36
- arm64-v8a
- ADB authorization available from the owner's Intel macOS Catalina machine

Do not repeat device-identification work unless the device state changes.

## COMPLETED SOURCE WORK

### Local inference
- Owner-selected GGUF import.
- Asynchronous large-file copy.
- Storage-space guard.
- Copy-size verification.
- Native GGUF validation before selection.
- llama.rn lifecycle architecture.
- Fast / Deep / Create / Code generation profiles.
- Runtime metrics path that must never fabricate values.

### Voice
- Explicit owner-started microphone session.
- react-native-audio-api integration.
- Local STT architecture.
- Start returns after recorder start rather than blocking on the transcript stream.
- Session identity guards prevent stale transcription updates.
- Stop/background/unmount cleanup.
- Device TTS path.
- No hidden background microphone service.

### Storage / memory / continuity
- SQLite persistence.
- Conversations and local titles.
- Owner-approved bounded memories.
- Projects and project-step lifecycle.
- pending/running/success/failed/retry states.
- Persisted lastCompletedStep and nextAction.
- Active-project continuity injected into prompts.
- Completed work must not be presented as pending.

### Tools
- Structured tool registry/router.
- Schema validation.
- Confirmation boundary where required.
- Tool result audit records.
- Deterministic routing before LLM tool planning.
- Authenticated loopback Termux bridge.
- No generic arbitrary-shell API.

### Workspaces
- Coach / Chat.
- Memory.
- Projects.
- Reflect.
- Understand.
- Settings diagnostics.
- Slash routing for analyse/draft/plan/project/memory/status.

### Optional online AI hub
- Keyless browser-side Puter gateway in React Native WebView.
- Dynamic live model catalog.
- Explicit free-only guard.
- Local persistence of online conversations.
- Official consumer-web launchers kept separate.
- Local GGUF remains independent from the online layer.
- No provider developer API keys embedded in JARVIS.

## PREVIOUS SOFTWARE VERIFICATION

Prior source-side work recorded successful parser/core assertions, Python compile checks, shell syntax checks, JSON checks, and source-presence smoke checks.

A prior project dossier also recorded TypeScript, lint, tests, and an isolated Expo prebuild passing at an earlier checkpoint. Treat those results as historical evidence only. The **current main branch must pass again** before APK status is claimed.

## CURRENT LIVE BUILD SIGNAL

After the latest push, GitHub commit status reported EAS workflow contexts for:

- `build-android.yml (@smiley007s-team/smiley)`
- `create-production-builds.yml (@smiley007s-team/smiley)`

Both were reported as `error`.

Do not guess the cause. Retrieve the actual workflow/build log when available. Common causes such as credentials, workflow setup, dependencies, or native compilation are hypotheses only until the log proves one.

A separate GitHub Actions workflow exists specifically so Android compilation can be verified without depending on EAS workflow success.

## GITHUB ANDROID VERIFICATION WORKFLOW

File: `.github/workflows/android-build.yml`

Required gates:

1. checkout
2. pnpm 10.15.0
3. Node 20.19.4
4. Java 17
5. Android SDK 36
6. `pnpm install --no-frozen-lockfile`
7. `npx expo install --check`
8. `pnpm check`
9. `pnpm lint`
10. `pnpm test`
11. `pnpm smoke`
12. `npx expo prebuild --platform android --clean --no-install`
13. `./gradlew assembleDebug --stacktrace --no-daemon`
14. verify `android/app/build/outputs/apk/debug/app-debug.apk`
15. upload `JARVIS-ROG-debug-APK`

Only a produced APK counts as a build pass.

## NEXT EXACT ACTION FOR CLAUDE CODE

At the start of the next Claude Code session:

1. Read this file completely.
2. Run `git status --short --branch`.
3. Run `git log -15 --oneline`.
4. Inspect the latest CI/EAS result before editing application features.
5. If GitHub Actions has a failing Android run, read the first failing job/step and its full log.
6. Reproduce locally when possible.
7. Fix the smallest root cause.
8. Run the affected gate.
9. Run the entire verification chain again.
10. Commit and push only verified fixes.
11. Repeat until the debug APK is produced.

Do **not** spend a session rebuilding features that are already implemented unless a compiler/runtime test demonstrates that they are broken.

## REQUIRED LOCAL COMMAND CHAIN

```bash
corepack enable
corepack prepare pnpm@10.15.0 --activate
pnpm install
npx expo install --check
pnpm check
pnpm lint
pnpm test
pnpm smoke
npx expo prebuild --platform android --clean --no-install
cd android
./gradlew assembleDebug --stacktrace --no-daemon
```

If any command fails, stop advancing and repair that real failure first. Do not weaken TypeScript, lint, tests, native functionality, or security boundaries just to obtain a green build.

## AFTER APK SUCCESS

Install the exact produced APK on the physical ASUS ROG Phone 8 Pro using ADB.

Then execute `docs/ACCEPTANCE_TESTS.md` and record only observed evidence in `docs/ACCEPTANCE_REPORT.md`.

The critical physical tests include:

- cold launch
- GGUF picker/copy/parse/load
- offline English inference
- offline Arabic inference
- Fast/Deep/Create/Code modes
- real measured TTFT/tokens-per-second only
- memory persistence and deletion
- project continuity after restart
- voice permission
- real local transcript
- microphone stop/background cleanup
- TTS
- Termux absent behavior
- Termux authentication and allowlist rejection
- tool audit
- erase-all behavior
- representative thermal/stability run
- Android WebView authentication for the online hub
- free-only online model guard
- streamed online response persistence
- local GGUF continuing to work with internet disabled

## OPTIONAL STAGE 2 — ONLY AFTER CORE PASS

Do not block the APK on these:

- Shizuku adapter
- Android Assistant role
- MediaProjection screen understanding
- explicitly enabled Accessibility helper
- Quick Settings tile
- OEM/ROG-specific integrations
- local wake-word layer

Implement them after the core APK passes, behind capability detection and explicit enablement.

## ENGINEERING NON-NEGOTIABLES

- Never fake model, GPU/NPU, microphone, transcript, tool, or performance state.
- Never replace failing native behavior with mock success.
- Never introduce LLM -> arbitrary shell execution.
- Keep retrieved memories/documents as untrusted reference data.
- Keep local GGUF usable without internet, Termux, Shizuku, screen capture, or online providers.
- Keep microphone/screen-sensitive sessions visible and owner initiated.
- Do not silently switch a free online model request to a paid model.
- Preserve existing user data across migrations.
- Prefer root-cause fixes over broad rewrites.
- Update this file after every verified checkpoint.

## DEFINITION OF DONE

JARVIS is not “alive” because the UI opens. It is alive when a real APK on the ROG Phone can:

- run the local model offline,
- understand English and Arabic,
- accept real voice input,
- speak responses,
- remember approved information,
- preserve project continuity,
- execute bounded audited tools,
- survive restarts,
- expose truthful diagnostics,
- optionally access the free/keyless online hub without breaking local operation,
- and pass the documented acceptance gates.

Until those are observed, report the remaining gap truthfully.
