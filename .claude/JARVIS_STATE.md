# JARVIS ROG — LIVE BUILD STATE

> **DEVICE CRASH ROOT CAUSE + FIX — 2026-09-22**
>
> Physical ROG logcat identified the startup crash exactly:
> `react-native-audio-api 0.9.3` constructs `AudioAPIModule` before the JS runtime is ready,
> causing `AudioAPIModule.initHybrid()` to throw a NullPointerException on startup.
> This is the same upstream defect fixed by Software Mansion PR #971 by moving
> `initHybrid` into `install()` and asserting the JS queue thread.
>
> JARVIS now backports that upstream native fix deterministically from
> `scripts/patch-react-native-audio-api.mjs` via the root `postinstall` hook.
> CI verifies the patched native source before continuing. The local LLM,
> memory, Android Assistant, tools, Termux bridge, and hands-free design were not removed.
>
> Startup hardening remains: the lightweight app shell paints before heavy
> AI/audio imports, but the real JARVIS runtime starts automatically immediately
> afterwards, and an already-configured GGUF still auto-loads.
>
> **Current gate:** build a new arm64 release APK from the current
> `feat/handsfree-jarvis-rog` head, install that exact APK, then re-run cold launch.
> Do not reinstall or validate the older `b9c88cb` APK; it contains the confirmed
> crashing Audio API initialization path.
>
> **VERIFICATION UPDATE — 2026-09-21**
>
> Continue from `feat/handsfree-jarvis-rog`; see
> `docs/BUILD_VERIFICATION_2026-09-21.md` for current evidence. Missing GitHub logs
> do not establish an account-level failure. The currently accessible Expo
> project differs from the project configured in this repository.
> Local Android compilation was interrupted by cancelled network approval;
> the offline fallback confirmed that build dependencies are still missing.
> No APK was produced. Restore approved downloads or original Expo access to resume.
> Source checks and prebuild are not APK or device acceptance.

> **AUDIT UPDATE — 2026-09-20**
>
> Current working branch: `feat/handsfree-jarvis-rog`.
> Build target: **0.4.0** for `com.app.localjarviscoach`.
> The older sections below are retained as historical evidence, but any statement
> saying background voice or Android Assistant is "not implemented" is superseded
> by this update.
>
> Current source now includes: microphone foreground-service configuration,
> hands-free wake-word routing, local STT, local GGUF reasoning, Android
> VoiceInteractionService/SessionService integration, bounded tool planning,
> Maps/email intents, authenticated Termux actions, owner profile memory, and
> local TTS. The Termux installer is repeatable, creates its secret with Python,
> prepares a Termux:Boot startup script, and all tracked shell scripts are stored
> executable in Git.
>
> Final audit fixes include: correct speech-recognition bind permission, safe
> wake-word boundary matching, STT input muted while JARVIS speaks, truthful
> loaded-runtime diagnostics, clean Termux bridge restarts, and corrected
> hands-free acceptance tests.
>
> **Current gate:** run one clean EAS Android preview build from the final audited
> branch, then install that exact APK on the physical ROG Phone 8 Pro and execute
> `docs/ACCEPTANCE_TESTS.md`. Do not claim final device success before those
> tests pass.


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

### EAS — ROOT CAUSE FOUND AND FIXED

The EAS commit statuses carried the real error, which never appeared in any
GitHub Actions log:

```
Failed to create workflow run. Invalid workflow definition.
[on.workflow_dispatch]: Invalid input: expected object, received null.
```

Both `.eas/workflows/*.yml` declared a bare `workflow_dispatch:` with no value.
YAML resolves that to null. GitHub Actions tolerates it; the EAS workflow
schema requires an object and rejects the **entire definition**, so EAS never
created a run for any commit. That is the "EAS is reporting ERROR" symptom,
and it was a one-token bug: `workflow_dispatch: {}`.

**Verified by back-to-back commits on the same branch:**

| Commit | EAS statuses |
| --- | --- |
| `134413a` (before fix) | 2 x `error`, "Invalid workflow definition" |
| `1cfe97a` (after fix) | 0 statuses, definition accepted |

EAS now posts nothing on this branch because the push trigger targets `main`
and this is a feature branch. That is correct behaviour for a valid
definition; the parse error used to fire regardless of branch.

**Why this is the critical path:** EAS builds run in Expo's cloud and do NOT
depend on the GitHub Actions runners that are failing to allocate on this
account. Merging this to `main` should start a real EAS Android build and
produce an installable APK, routing around the runner block entirely.

The `preview` profile is `distribution: internal` with `buildType: apk`, so it
yields a directly sideloadable APK for the ROG Phone 8 Pro rather than an app
bundle. EAS runs `pnpm install` itself, so it picks up the
`pnpm.onlyBuiltDependencies` allowlist and fetches llama.rn's arm64 jniLibs
rather than building an APK with no inference engine.

Also stopped a duplicate build: both EAS workflows declared the identical job
(android/preview) on push to main, so every push started two identical cloud
builds and spent twice the EAS allowance for one artifact.
`create-production-builds.yml` is now manual-only. Neither file was deleted.

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
| `pnpm lint` | pass, 0 errors, 0 warnings |
| `pnpm test` | pass, 15 files, 76 tests |
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

## SESSION 2 ADVANCES (audit of the subsystems the handoff listed)

Found by auditing, not by chasing a compiler error.

### Arabic was not actually implemented

`settings.language` drove only the TTS voice. It never reached `buildMessages`,
so the system prompt carried no language directive at all: selecting Arabic
changed which voice spoke while the model kept answering in English. "Offline
Arabic" is an acceptance gate, so this was close to a feature that did not
exist.

`buildMessages` now takes a language and emits an explicit directive ahead of
the mode instruction, because small quantised models drift back to English when
the requirement is stated late or softly. The Arabic directive keeps code,
paths and identifiers in Latin script and suppresses unsolicited English
translations. 10 tests.

### The database could not evolve without risking owner data

`migrate()` was one `CREATE TABLE IF NOT EXISTS` block with no version counter.
Idempotent, but incapable of migrating: on a device that already has a table, a
later added column silently never appears.

Now uses `PRAGMA user_version` with one step per version. Step 1 is the
existing baseline, written so a pre-versioning install adopts version 1 without
losing anything. Future steps must be additive.

The schema moved to `lib/storage/schema.ts` with no expo-sqlite or React Native
import, so **the exact SQL that ships is executed against a real SQLite engine**
(`node:sqlite`) in tests: fresh apply, idempotent re-run, adoption of a
pre-versioning database with rows intact, and `ON DELETE CASCADE` genuinely
removing dependents. 8 tests.

`getDatabaseDiagnostics()` reads `user_version`, `foreign_keys` and
`journal_mode` back off the open connection rather than assuming the pragmas
took effect.

### planRuntime was wired but could never fire

Settings always supply contextSize/batchSize/threads/gpuLayers, and explicit
options override the plan, so the planner was dead code in practice. Added an
owner-controlled `adaptiveRuntime` setting, default on.

`lib/device/powerState.ts` reads **real signals only**: battery level and
charging state (expo-battery), total RAM (expo-device). Both autolink for
Android; prebuild stays clean.

**Thermal status was unavailable as of Session 2** and was reported as such in
Settings. `PowerManager.getCurrentThermalStatus()` was not bridged by React
Native and needed a small native module. Battery temperature was deliberately
NOT substituted: it measures the pack, not the SoC, and lags the Snapdragon
badly under load. **The bridge now exists — see SESSION 3 below —** but has
not yet been exercised on the physical ROG Phone; do not claim thermal
adaptation is *proven* until that reading is observed in Settings on-device.

The Settings runtime card now shows the plan the loaded context was **actually
built with**, its tier and reason, whether a thermal reading was present, the
observed battery/charging/RAM values with N/A where unread, and every
unavailable signal with its cause.

### GBNF constrained tool calling

`lib/tools/grammar.ts` generates a GBNF grammar from the registry itself, so
the sampler can only emit a complete JSON object with exactly `tool` and
`arguments`, and `tool` can only be a registered name. A tool outside the
allowlist is unrepresentable rather than rejected after the fact.

The grammar does **not** validate arguments against a tool's schema. Arguments
are constrained to valid JSON; zod still validates them in the router, and the
executor allowlist remains the security boundary. `parseToolCall` re-checks the
allowlist rather than trusting the grammar, so a call arriving another way
cannot bypass it. 15 tests.

`RunCompletionInput.grammar` is plumbed through to llama.rn. **The grammar is
unit-tested for structure but has not yet been executed by llama.cpp on
device** -- confirm it during acceptance testing before relying on it.

No autonomous LLM tool-execution loop was added. Planning returns a validated
call; execution still goes through the existing audited router and its
confirmation policy.

## SESSION 3 — cross-checked the ChatGPT-authored source pack, closed the thermal-bridge gap

Audited `JARVIS_ROG_ALL_CODE.md` / `CLAUDE_HANDOFF.md` (the Build 0.3.0
reference pack the owner had generated externally) against the live
repository file-by-file. Every file it lists already exists in the working
tree; nothing from that pack is missing or silently dropped. No duplicate or
competing implementation was found — `lib/inference/standaloneModel.native.ts`
is the single real `llama.rn` call path, already wired to `thermalPlan.ts` and
`lib/tools/grammar.ts` from Session 2. Everything added since (thermal
planning, schema versioning, GBNF grammar, the device power reader) is
additive on top of that pack, not a parallel rewrite.

### PowerManager thermal bridge — the gap flagged in Session 2, now closed

Added `modules/expo-thermal-status/`, a local Expo Module (autolinked from
`./modules` per Expo's default `nativeModulesDir`, so it survives
`expo prebuild --clean` without editing generated `android/` files directly).
It exposes exactly one native fact: `android.os.PowerManager
.getCurrentThermalStatus()` (API 29+, no permission required). Below API 29,
or when the system service is absent, it returns `undefined` — never a
guessed value.

`lib/device/powerState.ts` now calls it and feeds a real `thermalStatus` into
`planRuntime()`, so the five-tier adaptive runtime built in Session 2 has a
live signal instead of always falling through to "no thermal reading yet".

Verified in this session:
- `pnpm check` / `pnpm lint` / `pnpm test` (76 tests) / `pnpm smoke`: all pass.
- `npx expo prebuild --platform android --clean --no-install`: clean, no warnings.
- `npx expo-modules-autolinking resolve --platform android`: confirms the
  module is discovered with the correct `sourceDir` and native class
  (`expo.modules.thermalstatus.ExpoThermalStatusModule`) — the same resolver
  `settings.gradle`'s `expoAutolinking.useExpoModules()` calls at build time.

**Not yet verified:** the Kotlin actually compiling under Gradle (this
sandbox cannot reach `dl.google.com`) and a real on-device thermal reading.
Both are EAS/physical-device checks, not code-review items — confirm the
Settings runtime card shows a non-"no thermal reading yet" reason string
after installing this build on the ROG Phone.

Also excluded `modules/**` from `tsconfig.json`'s root `include` (kept
resolvable via `import` from elsewhere): pnpm's isolated `node_modules`
layout meant `tsc` resolved the local module's own source path directly
instead of through its symlink, breaking its internal `expo-modules-core`
import. This does not affect Metro/Gradle, only `tsc`'s type-check walk.

## SESSION 4 — the two branches were merged, and the eight tabs became one ambient HUD

### Merge first, build second

`main` carried Sessions 1–3 (jniLibs fix, Arabic directive, schema versioning,
GBNF grammar, adaptive runtime, thermal bridge). PR #4
(`feat/handsfree-jarvis-rog`, open and draft) carried the hands-free work: wake
word, microphone foreground service, the native
`VoiceInteractionService`/`RecognitionService` assistant registration, the
constrained tool planner, the Qwen3-4B one-tap download, the
`react-native-audio-api` startup-crash backport, and the ROG install scripts
including `scripts/install-fixed-on-phone.sh`.

Neither branch was a superset of the other. `origin/feat/handsfree-jarvis-rog`
was merged into this branch — **cleanly, zero conflicts** — before any new work
started, so nothing from either line was stranded. This branch is the only
place both now exist.

### The interface

The eight-tab bar (Coach · Chat · AI Hub · Projects · Memory · Understand ·
Reflect · Settings) is gone. There is one screen: the orb. Every former tab is
still a route and is reachable as a sheet from the HUD drawer. The route group
was renamed `app/(tabs)` → `app/(hud)` — group names do not affect URLs, so
every existing `router.push` and deep link still resolves — and its `_layout`
is a `Stack` rather than `Tabs`.

`components/CoachRuntimeScreen.tsx` → `components/JarvisHud.tsx`. The
hands-free wake loop, the self-listening suppression and the voice session
lifecycle inside it are PR #4's, unchanged; only the presentation is new.
**There is no second runtime screen.**

Full rationale, file map and honest limits: `docs/AMBIENT_HUD.md`.

### The orb reports measurements, not animation

`components/JarvisOrb.tsx` is an animated arc reactor whose core is scaled by
**measured microphone RMS** (`lib/voice/audioLevel.ts`), taken from the PCM
frames the recorder actually delivered. No capturing session means level 0 and
a resting orb; frames dropped by the self-listening guard also read 0, so the
orb never shows JARVIS reacting to its own voice.

`lib/hud/hudState.ts` derives the one word under the orb. `unloaded` reads
OFFLINE and `loading` reads PREPARING — there is no optimistic READY — and the
status strip reports acceleration only as `modelState.gpu` / `reasonNoGPU`
actually reported it.

Built from `Animated` and native-driver transforms only: no SVG, no Skia, no
Reanimated, no new dependency, and no contention with token streaming on the JS
thread. Rotation stops under `AccessibilityInfo.isReduceMotionEnabled()`.

### Barge-in

`lib/voice/bargeIn.ts` matches a whole-utterance halt in English or Arabic and
the HUD stops TTS and generation directly, with no model call. Matching is
narrow on purpose — "stop the car at the roundabout" is a question. While
JARVIS is *speaking*, its own frames are discarded by design, so a spoken halt
cannot be heard in that window: **tapping the orb is the barge-in there**.
Spoken halts do reach the transcriber while it is generating.

### Deliberately not done

A floating `TYPE_APPLICATION_OVERLAY` orb drawn over other apps. It needs a new
Kotlin Expo module, a `Settings.canDrawOverlays` consent flow and its own
foreground service. This repository already carries native surface that has not
yet survived a verified device launch; adding more before this branch produces
an installable APK would make a failure harder to localise. The Android assist
gesture already opens the HUD, because the hand-off in
`JarvisVoiceInteractionSession` lands on `MainActivity`, which is now the orb.

### Verified this session

`pnpm check` 0 errors · `pnpm lint` exit 0 · `pnpm test` 23 files / 123 tests ·
`pnpm smoke` 11 checks · `npx expo prebuild --platform android --clean` clean,
no warnings. The generated manifest carries both assistant services,
`BIND_VOICE_INTERACTION`, `FOREGROUND_SERVICE_MICROPHONE` and both `res/xml`
configs, so PR #4's native registration survived the merge.

**No APK was produced here, and none was attempted.** `dl.google.com` was
re-tested this session and is denied at the CONNECT by this environment's
egress policy (HTTP 403), so no Android SDK or AGP artifact can be fetched and
Gradle cannot run. `api.expo.dev` is denied too, so EAS cannot be driven from
this session either. The APK gate is unchanged: it is EAS or GitHub Actions,
from the owner's side.

## SESSION 4B — the voice became conversational, and the phone can now build its own APK

### The APK dead end was a script bug, not only the runner block

`scripts/install-fixed-on-phone.sh` could only **download** a finished EAS
build, pinned to hardcoded commit `e6e0246`. No such build existed, so the
script always failed with nothing the owner could do about it. Nothing in the
repository ever *started* a build: `.eas/workflows/build-android.yml` is
`workflow_dispatch: {}` — manual only, deliberately, to conserve build credits.
So merging to `main` does **not** trigger an EAS build. Any note above saying
it does is superseded.

The script now builds the commit that is checked out
(`eas build --platform android --profile preview --non-interactive --wait`),
waits, then runs the existing integrity checks and installs. It runs from
Termux on the owner's own network, so it depends on neither the blocked GitHub
Actions runners nor any agent sandbox egress.

It also names the account-access failure specifically. `app.config.ts` points
at owner `smiley007s-team` / project `eda56376-…`; if the signed-in account
cannot reach it, the script says so and offers `eas init --force` to build
under the owner's own account instead. The package id is unchanged, so the APK
installs over any previous build either way. Guarded by
`tests/phoneInstallContract.test.ts` so it cannot regress to download-only.

### Streaming speech — the largest free latency win

JARVIS generated the whole answer and only then began speaking. On a 4B model
writing six sentences, that is most of a minute of silence.

`lib/voice/speechStream.ts` segments the token stream at sentence boundaries
and speaks each finished sentence while the model writes the next. Time to
first word drops from "the whole answer" to "the first sentence", and the voice
then stays ahead of the generator. A sentence is released only once its
terminator has actually arrived — nothing is predicted or faked.

`speakQueued()` was added because `speakResponse()` calls `Speech.stop()`
first, which would make each new segment silence the previous one. Handles
decimals, abbreviations, `?!` runs, Arabic `؟`, unpunctuated run-ons, and
strips markdown so it is not dictated aloud. Barge-in uses a **speech epoch**,
so segments queued for an abandoned answer are dropped rather than resuming
after the engine queue is cleared. 11 tests.

### The HUD now holds a conversation

It was calling `ask()` with no history, so every utterance was a cold start and
"and tomorrow?" had nothing to attach to. `lib/hud/conversation.ts` keeps a
bounded 12-message window, appended as pairs so history never holds a question
with no answer. In-memory only — Chat records and approved memory remain the
persistence layer. 7 tests.

### Verified

`pnpm check` 0 errors · `pnpm lint` exit 0 · `pnpm test` 26 files / 145 tests ·
`pnpm smoke` 11 checks. Both embedded snippets in the shell script were
executed directly (`bash -n`, and the JSON parser fed sample EAS output).

**Still no APK from this environment, and still none attempted** — the egress
block on `dl.google.com` and `api.expo.dev` is unchanged. What changed is that
the owner now has one command that produces one.

## SESSION 5 — a real APK from this branch, and the 45-minute wall measured and beaten

### EAS was reachable all along — through the Expo connector

Session 4 recorded that EAS could not be driven from here because
`api.expo.dev` is denied to the sandbox shell. That was true of the shell and
wrong as a conclusion: the Expo MCP connector reaches EAS through a different
path. `build_list`, `build_run`, `build_info`, `build_logs` and `build_cancel`
all work. Two finished APKs already existed in the project (`e6e0246`,
`b9c88cb`); the owner installed `e6e0246` and sent screenshots.

### What the owner's device test showed (Build e6e0246)

No startup crash (the AudioAPIModule NPE backport holds on hardware); local
STT READY; orb LISTENING with the mic indicator lit — and `Model: Not
selected`, so JARVIS heard everything and answered nothing. Every tab icon
rendered as a missing-glyph box. Puter sign-in spun forever. All acted on in
08dc9b5 (see its commit message).

### Why builds died at 45 minutes — measured per Gradle task

| Build | ABIs | ccache | Gradle | llama.rn | Result |
| --- | --- | --- | --- | --- | --- |
| 7 cancelled | all 4 | miss | 39.9 min (still compiling) | — | killed at 45 |
| `b9c88cb` | arm64 | miss | 37.0 min | 19.1 min | ~5 min spare |
| `e6e0246` | arm64 | hit | 17.2 min | 0.4 min | fine |
| **`bc77eace` (08dc9b5)** | **arm64** | **miss** | **18.3 min** | **3.8 min** | **20.1 min total** |

`bc77eace` is a **cold** build ("No cache found for this key") — exactly the
case that used to die — and finished with ~25 minutes to spare. The log
confirms `Building rnllama variants:
rnllama_v8_2_dotprod_i8mm_hexagon_opencl,rnllama_v8_2_dotprod_i8mm,rnllama`,
zero armeabi-v7a/x86 compilation, the llama.rn jniLibs postinstall ran, the JS
bundle was created, the audio-api patch applied, `BUILD SUCCESSFUL`, no
`FAILURE`.

**APK:** https://expo.dev/artifacts/eas/_FJQv4viVLNAgwyC903-xZ9w8Ol1D_pfR0mkWydnjHw.apk
(expires 2026-10-07).

**Not proven from the log:** that the three llama.rn JNI bridges are inside
the APK — Gradle does not print CMake target names. The evidence points that
way (the variant line, 3.8 min of llama.rn compilation), and the phone-side
installer now requires `librnllama_jni_v8_2_dotprod_i8mm_hexagon_opencl.so`
and `librnllama_jni.so` by exact name, so the first on-device install settles
it. If the brain downloads but will not load, check this first.

### Built after 08dc9b5, not yet in any APK

- `fd40587` cloud brain fallback (Cerebras → Groq → Gemini), opt-in, keys in
  the keystore.
- `e23e9d2` floating orb over other apps — native Kotlin, never compiled yet.
- `36ca223` Kokoro on-device neural voice (British male), 351 MB opt-in; and
  two microphone-release bugs in the streaming speech path.
- `46f3c5e` Puter popup sign-in relay, built from puter.js 2.6.3's real
  protocol; Reset now remounts the bridge instead of reloading the stuck page.

The next EAS build, on the latest head, is the compile check for all of these.

Build `900e6cd8` (on `db35d19`) is that compile check — **FINISHED**
22:04 UTC 23 Sep: 12.7 min running (38 min queue), Gradle `BUILD SUCCESSFUL in
10m 55s` with a warm cache. `:expo-jarvis-overlay:compileReleaseKotlin` ran with
zero `e:` errors — the floating orb's Kotlin compiles. Variants line present.
APK: https://expo.dev/artifacts/eas/f6B2Km1heZMInvvdewwHI65nkZs9yZ4eS9P1MrqTskc.apk
`76094589` on `e6d1abd` (adds the live test link) — **FINISHED** 22:40 UTC,
13 min running after a 12-min queue, BUILD SUCCESSFUL, no Kotlin errors.
APK: https://expo.dev/artifacts/eas/JPL392ziksfTM-FLfC8znI7WfFxgaYn4mmAMh5ScfUk.apk
Haiku watcher v2 `session_012V9KpYDF4zXwvgiqLxuDbH` subscribed to
jarvis-live-tests#1 (first watcher stuck on a permission prompt, archived).

`scripts/rog-setup.sh` (Termux, no PC): pairs with the phone's own Wireless
debugging over 127.0.0.1, downloads + installs an APK (`install -r -g`),
grants mic/notifications, overlay (appops), battery-optimisation exemption,
background run, tries the ASSISTANT role, verifies, launches.

### Live test link (Session 6, after db35d19)

The owner asked for a way for Claude to see device tests live. Design, from
what both ends can actually reach: the sandbox reaches only GitHub (ntfy.sh,
Slack hooks and httpbin are policy-denied), and the GitHub integration cannot
create repositories (403), so the owner creates one private repo by hand.

- `lib/telemetry/liveLog.ts` — in-memory ring buffer (400) of events; secrets
  scrubbed by shape and by field name before recording.
- `lib/telemetry/githubChannel.ts` — batches events into comments on a private
  issue/PR; ≥8 s apart, 30-min session cap, honours retry-after / rate-limit
  reset, keeps lines through network loss, stops on 401/403/404 with a fix.
- `lib/telemetry/liveSession.ts` — the single link, status store for the HUD's
  red ● LIVE badge (tap = stop) and the Settings card.
- Token in the keystore (`jarvis.live.github.token`), fine-grained, one repo.
- HUD records: heard, wake/ignored, ask (route), answer (source, ms, first
  token ms), speak (engine), halt, brain/voice/HUD state, errors.
- Guide: `docs/LIVE_TEST_LINK.md`. Tests: `tests/liveLink.test.ts` (13),
  mutation-checked (min interval, backoff requeue).
- Channel = PR #1 in `OgSmiley1/jarvis-live-tests`, so comments wake a
  subscribed session; the cheap watcher is a Haiku session subscribed to it.
  Waiting on the owner to create the repo.

## NEXT EXACT ACTION

Both PR #2 and PR #3 are merged to `main` (`3a4e373`). Everything built across
Sessions 1–3 is on `main` now: the jniLibs postinstall fix, Arabic directive,
schema versioning, GBNF grammar, adaptive runtime planning, and the
PowerManager thermal bridge. The owner also pushed `c6c1868` directly to
`main` between the two merges, adding explicit `expo-linking` and
`react-native-worklets` dependencies (an `expo install --check` style
alignment) — merged cleanly, re-verified locally alongside everything else
(check/lint/test/smoke/prebuild/autolinking all pass together).

**Note for whoever picks this up next:** a separate ChatGPT session was also
pointed at this project and had reconstructed a stale Build-0.3.0-era source
pack after its own workspace was pruned — that pack does **not** contain any
of Sessions 2–3's work (thermal bridge, GBNF grammar, schema versioning,
Arabic, the jniLibs fix). The owner was told not to import it. `main` on
GitHub is the single source of truth; do not let any reconstructed/offline
pack overwrite it.

1. **Watch the EAS build.** The push from PR #3's merge re-triggered the
   `android/preview` EAS workflow in Expo's cloud. Check https://expo.dev
   under `@smiley007s-team/smiley` for the APK link. This session has no EAS
   credentials, so it cannot check this itself — confirm from the dashboard.
2. **Owner (in parallel, optional):** clear the account-level GitHub Actions
   block (billing page first) to restore the credential-free CI path. No
   longer the only route to an APK, so this is not blocking.
3. Download the APK and install it on the ROG Phone 8 Pro.
4. Execute `docs/ACCEPTANCE_TESTS.md` and record observed results only,
   including whether Settings now shows a real thermal reading (not
   "no thermal reading yet") and whether GPU acceleration is active.

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

## SESSION 6 — brain survives, phone control, charge reminder (24 Sep 2026)

Owner report: the brain downloaded yesterday asked to download again; a
download restarted from 0% after leaving the app. Causes and fixes in f2e9bbb.
Owner asked for Muse-style phone control (f151636) and a charge reminder
(82f9772).

Build `bc047ad7` on `82f9772` — **FINISHED** 18:58 UTC (queued 56 min on the
free tier, ran 14 min), BUILD SUCCESSFUL, zero Kotlin errors; both new local
modules (expo-jarvis-brain, expo-jarvis-phone) compiled.
APK: https://expo.dev/artifacts/eas/WikoiqX3Gkuuis1YzK-vCCAcrKMJUPvNDxDB6H1pyS4.apk
Not yet verified on the device: DownloadManager survival, the permission
prompts (SMS/call log are restricted for browser installs), app-list
visibility, reminder notifications.

## SESSION 7 — owner's build brief + build pack, phases A–G (26 Sep 2026)

Evidence in: owner's screen recording (build bc047ad7) — brain loaded through
the Termux push (so the one-command setup works end to end), but Qwen3's
<think> was displayed and spoken, "how are you?" took 37.07 s (TTFT 5.3 s,
5.9 tok/s, OpenCL GPU), the heard-line accumulated the whole session with
Whisper labels "(Bell)", and System UI ANR'd while the brain loaded on GPU.

| Phase | Commit | What | Verified how |
|---|---|---|---|
| A | 2311dd9 | enable_thinking:false; streaming think filter; stripThinking at completion, cloud, speakResponse/speakQueued; per-turn transcript + label cleaner; CPU default (GPU switch in Settings) | tests/voicePipeline.test.ts (18) incl. the exact ROG output under every chunking |
| B | ade2a42 | fast profile for spoken turns; no per-turn clearCache (prefix reuse); firstSpeechMs recorded; scripts/measure-voice-latency.mjs | script on the recorded run → 5.32 s / 37.07 s baseline. **On-device < 5 s: hardware-only, not yet measured** |
| C | 398976e | clock/date/status line; orb ripples (listen), fast spin (think), fast pulse (speak), breath (idle) | tests/dashboard.test.ts (8). **No screenshot: no web target; capture from the ROG** |
| D | bfd721e | vision.look: expo-image-picker camera (owner-taken photo), SmolVLM2-500M + mmproj via llama.rn multimodal, photo deleted, WATCHING state + "camera on"; per-file download slots; setup script fetches eyes; brain loader releases only its own context | tests/vision.test.ts (14). **On-device describe: hardware-only** |
| E/F/G | dfe8b17 | 8 s follow-up window after a spoken answer; PERSONA in system prompt; first-wake greeting by time of day + active project; docs/PI_SATELLITE.md (design only) | tests/greeting.test.ts (6) |

/no_think finding: llama.rn 0.13.0-rc.1 `completion()` accepts
`enable_thinking` and applies it through the GGUF's jinja template
(`getFormattedChat`, jinja on by default). Empirical check on the device
still owed: the live log's ANSWER lines must contain no "<think>".

Build `206bc03d` on 9ca8574 — **FINISHED** 02:54 UTC (13 min, no queue), BUILD SUCCESSFUL, zero Kotlin errors; expo-jarvis-brain and expo-image-picker compiled.
APK: https://expo.dev/artifacts/eas/TuPqVdcTlMn77N8u3RwXi11W9upHMn__4J4r6MDFxZQ.apk (now the setup script default).

## SESSION 8 — owner's ChatGPT handoff pack (26 Sep 2026)

Inputs: video-2 reverse-engineering report, reconstructed Windows Python JARVIS,
ops master handoff for PR #6, Sheikh Ammar museum handoff (not touched — out of
scope). Owner decisions: calls open the dialler only; no Windows app, port the
useful behaviours into the phone app. Plan: /root/.claude/plans/serialized-wiggling-newell.md.

| Commit | What | Verified |
|---|---|---|
| a5b2471 | live log: word counts, not words, unless a 30-min opt-in | tests/transcriptPolicy.test.ts |
| ab1dc21 | calls: ACTION_DIAL only, CALL_PHONE removed | tests/callDialer.test.ts |
| 7813fe4 | time/date, maths (EN+AR, no eval), system info (real readings only), site search, language switch, share sheet | tests/utilityCommands.test.ts (32) |
| 5bd0f0b | setup script verifies APK SHA-256 + native libs before install | simulated good/bad APK |

Build `5e5991f6` on 7813fe4 FINISHED 05:06 UTC, BUILD SUCCESSFUL, 0 Kotlin errors.
APK: https://expo.dev/artifacts/eas/v9B55KckY1CwC0c2GLoccdSAGvu66LE9DrxnTod35nk.apk (setup-script default). 370 tests green.
Device gates for this build: NOT RUN — awaiting the owner's live-link test.
