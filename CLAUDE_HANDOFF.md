# CLAUDE CODE — JARVIS ROG MASTER HANDOFF

## Mission

Complete the existing Local Jarvis Coach repository into a production-quality, local-first JARVIS assistant for the ASUS ROG Phone 8 Pro.

This source pack is **not permission to overwrite working code blindly**. It is a reference implementation and upgrade layer. The existing repository has already had meaningful hardening work; preserve validated behavior and merge selectively.


## Current build checkpoint — 0.3.0

Core-stability and keyless online-model sprints have already been applied to this pack. **Do not restart at Phase 0 as if this source were untouched.** Read `.claude/JARVIS_STATE.md` and `docs/BUILD_PROGRESS_0.2.0.md` first. The next external gate is dependency installation, full type/lint/test resolution, Android prebuild and Gradle compile. Preserve the 0.2.0 changes unless an actual compiler/runtime failure proves a specific change wrong.

The code-only environment that produced 0.2.0 could not reach `registry.npmjs.org`, so it truthfully did not claim `pnpm install`, Vitest, Expo prebuild, Gradle, APK, or physical-phone success. Continue from that exact point.

## Known project baseline

- Package ID: `com.app.localjarviscoach`
- Expo SDK 54
- React Native 0.81
- React 19
- TypeScript
- Expo Router
- `llama.rn` local GGUF inference
- local speech-to-text architecture
- device TTS
- local storage
- Fast / Deep / Create / Code modes
- owner-approved memory
- Coach / Chat / Memory / Reflect / Understand / Settings workspaces

## First command sequence

Do this before editing:

```bash
git status --short --branch
git log -12 --oneline
find . -maxdepth 3 -type f | sort | sed -n '1,260p'
cat package.json
cat app.config.ts 2>/dev/null || true
cat tsconfig.json
pnpm install
pnpm check
pnpm lint
pnpm test
```

Then create/update `.claude/JARVIS_STATE.md`.

## Continuity rule

At the beginning of every session read `.claude/JARVIS_STATE.md` and the current Git status.

Never repeat a completed step unless a new failure invalidates it.

After each verified subsystem, record:

- commit/checkpoint
- files changed
- tests run
- actual result
- remaining blocker
- next exact action

## Merge strategy

For each file in this pack:

1. Locate equivalent existing file.
2. Compare behavior.
3. Keep whichever implementation is more complete and verified.
4. Port missing behavior only.
5. Run related tests immediately.
6. Do not rename large parts of the existing project merely to match this pack.

In particular, inspect the existing native voice implementation before changing it. If it already has lifecycle protections or model-resource setup that this pack lacks, preserve them.

## Core engineering boundaries

### Never fake runtime state

Do not invent:

- model load success
- GPU/NPU use
- tokens/sec
- TTFT
- transcription
- tool execution
- device state
- microphone state

Only display data returned by the runtime.

### Do not expose arbitrary shell

Forbidden architecture:

```text
LLM -> arbitrary string -> shell=True
```

Required architecture:

```text
LLM -> structured ToolCall -> schema validation -> confirmation policy -> allowlisted executor -> ToolResult -> audit log
```

### Local-first core

Normal Chat, memory, projects, Understand, model inference, and basic voice must not require Termux, Shizuku, or a cloud API.

Termux and Shizuku are optional adapters.

### Visible sensitive sessions

Microphone and screen capture must be user-initiated and visibly active. Leaving the relevant experience must clean up resources.

## Implementation order

### Phase 0 — audit

Establish what already works and what is mocked. Do not make changes until this is written into `.claude/JARVIS_STATE.md`.

### Phase 1 — inference

- GGUF import verification
- llama.rn model load/unload
- Fast/Deep/Create/Code profiles
- streaming output
- real runtime metrics
- blank completion rejection
- clear OOM/load errors

### Phase 2 — persistence

- SQLite
- preserve/migrate existing user data
- conversations/messages
- approved memories
- projects/project steps
- tool audit runs

Do not delete legacy AsyncStorage until migration is proven. Inspect the current source for its exact keys; do not guess them.

### Phase 3 — continuity

Every active project must surface:

- objective
- last completed work
- failed work
- pending work
- next concrete action

### Phase 4 — voice

- explicit permission
- visible start/stop
- local STT
- TTS
- background/unmount cleanup
- no fake transcript

### Phase 5 — tools

- registry
- Zod/JSON Schema validation
- confirmation policy
- result audit
- deterministic commands before LLM tool planning

### Phase 6 — Termux

Use only the localhost authenticated allowlist in `termux/`. Do not add generic command execution.

### Phase 7 — optional Android integrations

Implement only after core is stable:

- Shizuku capability adapter
- RoleManager assistant role request
- MediaProjection user-approved screen capture
- Accessibility helper with explicit enablement
- Quick Settings tile

See `docs/STAGE2_ANDROID_NATIVE.md`.

### Phase 8 — hardening

Run every software gate and then produce an APK for physical-device tests.

## Required software gates

```bash
pnpm check
pnpm lint
pnpm test
npx expo prebuild --platform android --clean
cd android
./gradlew assembleDebug
./gradlew assembleRelease
```

No "should compile" statements. Compile it.

## Physical acceptance

Use `docs/ACCEPTANCE_TESTS.md` and record evidence in `docs/ACCEPTANCE_REPORT.md`.

Do not mark a hardware test PASS unless it was actually performed on the ROG Phone.

## Response style while building

Do not stop after a plan. Implement the next safe unit of work.

Every progress update should contain only:

1. verified completed work
2. exact tests/results
3. blocker, if any
4. next action

## Definition of done

Core is done only when:

- APK installs
- real GGUF imports and loads
- airplane-mode inference works
- Arabic and English work
- conversations persist
- approved memory persists
- project continuity survives restart
- voice input is real and cleanly stoppable
- TTS is real
- unsafe arbitrary shell is absent
- optional adapter failures do not break core
- tests/build gates pass
- physical-device outcomes are documented truthfully

## Build 0.3 continuation note

A keyless Online Models Hub is now present. Preserve it unless a tested replacement is better.

Files to inspect first:
- `app/(tabs)/online.tsx`
- `components/PuterGateway.native.tsx`
- `lib/online/puterBridgeHtml.ts`
- `lib/online/modelCatalog.ts`
- `docs/ONLINE_MODELS.md`

Rules:
- Keep local GGUF independent from all online services.
- Do not embed provider API keys.
- Do not scrape or reverse-engineer ChatGPT/Gemini/Grok consumer sites.
- Free-only must never silently select a non-free model.
- Pull current model availability from the live gateway instead of hard-coding model marketing names.
- Validate Android WebView auth and streaming on the physical ROG Phone before calling this subsystem complete.
