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

## CURRENT LIVE BUILD SIGNAL (updated this session)

### The CI failure was never a code failure

Every GitHub Actions run on `main` fails in about three seconds with **zero
steps executed and no downloadable logs**. That includes `runner-smoke.yml`,
whose entire body is `echo "runner-ok"`. A trivial echo job cannot fail on its
own merits.

`OgSmiley1/jarvis-rog` is a **public** repository, so Actions minutes are free
and unlimited. A public repo whose jobs never allocate a runner points at an
**account-level Actions restriction**, not at this project's YAML, dependencies
or native build.

**This is the single remaining blocker to producing the APK, and only the
repository owner can clear it.** Check, in order:

1. https://github.com/settings/billing — look for a spending limit, a failed or
   missing payment method, or a past-due balance. A blocked payment method
   halts Actions for the whole account, public repos included.
2. https://github.com/settings/actions — confirm Actions is enabled for the
   account and for this repository.
3. The repository's own Actions tab — look for a banner about disabled
   workflows or an account restriction.

Do not spend another session rewriting workflow YAML. The YAML is valid and
was re-validated this session. The runner is the problem.

### EAS

The `.eas/workflows/*.yml` contexts also reported `error`. They were not the
focus this session because they depend on EAS credentials that are not
available to a headless agent. The GitHub Actions pipeline is the
credential-free path and should be fixed first.

### Local build attempt in the agent sandbox

Attempted directly and got further than CI ever has:

- `pnpm install` — pass
- `npx expo prebuild --platform android --clean --no-install` — **pass, and now
  warning-free**
- Gradle 8.14.3 downloaded and configured, JDK 17 installed, and the build
  reached dependency resolution.

It then stopped at an environment limit, not a project defect: the agent
sandbox's egress policy denies `dl.google.com` with HTTP 403. Every Android
Gradle Plugin and SDK artifact resolves there (`maven.google.com` 301-redirects
to it), so no Android toolchain can be fetched in that sandbox. **An APK cannot
be produced from the agent environment.** It must come from GitHub Actions or
EAS, which is why the account-level Actions block above is the critical path.

## VERIFIED THIS SESSION — ALL GATES GREEN

Run against the real toolchain, not asserted:

| Gate | Result |
| --- | --- |
| `pnpm check` (tsc strict) | pass, 0 errors |
| `pnpm lint` | pass, 0 errors, 1 pre-existing warning |
| `pnpm test` | pass, 12 files, 43 tests |
| `pnpm smoke` | pass, 9 checks |
| `npx expo prebuild` | pass, no warnings |

`npx expo install --check` could not run in the sandbox because `api.expo.dev`
is also outside the egress allowlist. It is unchanged in CI and should be
re-checked there.

## ROOT CAUSES FIXED THIS SESSION

### 1. The APK would have been dead on the device (most important)

`llama.rn` does not ship its Android inference libraries inside the npm
tarball. A `postinstall` hook downloads `android/src/main/jniLibs` at install
time. **pnpm 10 blocks lifecycle scripts by default**, so that download never
ran; the only symptom was one line in the install log reading
`Ignored build scripts: esbuild, llama.rn, unrs-resolver`.

With `jniLibs` absent and `RNLLAMA_BUILD_FROM_SOURCE` defaulting to false,
CMake skips every `librnllama` variant with "no prebuilt for arm64-v8a".
**Gradle still succeeds. The APK still installs and launches. Local GGUF
inference is simply gone.** This would have looked like a successful build and
a broken JARVIS.

Fixed by declaring `pnpm.onlyBuiltDependencies` in `package.json`. All seven
arm64-v8a variants now download, including
`librnllama_v8_2_dotprod_i8mm_hexagon_opencl.so`, the fastest path for the
Snapdragon 8 Gen 3 (which has both dotprod and i8mm).

CI now asserts this twice so it can never ship silently again: once after
install that the arm64 `jniLibs` exist, and once after packaging that
`lib/arm64-v8a/librnllama*.so` is actually inside the APK. **A green Gradle run
is no longer accepted as proof that inference shipped.**

### 2. Source did not compile

`hooks/useLiveVoice.native.ts` had a closing brace absorbed into a trailing
comment, so the file did not parse. Repairing it exposed three genuine API
mismatches against the installed `react-native-audio-api` 0.9.3: the capture
format belongs in the `AudioRecorder` constructor, `onAudioReady` takes a
single callback, and `start()`/`stop()` are synchronous. Capture stays 16 kHz
mono for the local Whisper graph. No microphone behaviour was mocked.

`app/(tabs)/online.tsx` used `useRef<string>()`, which is an error under the
React 19 typings.

### 3. Lint and test gates were failing for environmental reasons

The ESLint import resolver did not know about React Native platform suffixes,
so `@/hooks/useLiveVoice` read as unresolved. Taught the resolver the
`.native`/`.android`/`.ios`/`.web` extensions rather than disabling the rule.

`tests/toolRouter.test.ts` failed because the tool registry eagerly imports
`react-native`, whose Flow-typed entry point Vitest cannot parse under Node.
Added narrow test-only aliases under `tests/stubs/`. These are test-environment
only; Metro still bundles the real native modules into the APK.

## NEW: HARDWARE-AWARE INFERENCE

`lib/inference/thermalPlan.ts` replaces hardcoded `n_threads: 6` /
`n_gpu_layers: 99` with `planRuntime()`, a pure function mapping observed
thermal and power state onto five tiers, from `overdrive` down to a CPU-only
`survival` tier. Fully unit-tested (16 cases).

It obeys the truthfulness rules by construction:

- With no readings the plan equals the previous fixed defaults and
  `thermalSignalPresent` is `false`, so diagnostics can say "not measured"
  rather than implying the device was checked.
- An undetected cooler reads as `undefined`, never as confidence in headroom,
  and a cooler cannot override an already-throttling device.
- `getActiveRuntimePlan()` reports the plan the loaded context was **actually
  built with**, and is cleared on unload and on load failure.
- Explicit caller options still override the plan.

**Still to wire:** nothing reads Android's `PowerManager.getCurrentThermalStatus()`
yet, so `planRuntime()` currently receives an empty state and therefore returns
the previous defaults. The mapping is proven; the platform sensor bridge is the
next step. Until that bridge exists, do not claim thermal adaptation is live on
the device.

Also enabled `enableOpenCLAndHexagon` (replacing the deprecated `enableOpenCL`)
and added `expo-system-ui` so the declared dark `userInterfaceStyle` applies.
The generated manifest declares `libOpenCL.so` and `libcdsprpc.so`, so the
Adreno GPU and Hexagon DSP paths are available to the prebuilt engine.
**GPU/NPU availability is still only whatever llama.rn reports at runtime via
`context.gpu` / `reasonNoGPU`. Never present these flags as proof of
acceleration.**

## NEXT EXACT ACTION

1. **Owner:** clear the account-level GitHub Actions block (billing page
   first). Nothing else can proceed until a runner starts.
2. Re-run "JARVIS ROG Android Build". It should now pass every gate, since all
   of them were verified locally this session.
3. Download the `JARVIS-ROG-debug-APK` artifact and install it on the ROG
   Phone 8 Pro.
4. Execute `docs/ACCEPTANCE_TESTS.md` and record observed results only.
5. Then wire the `PowerManager` thermal bridge into `planRuntime()`.

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
