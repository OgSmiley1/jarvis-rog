# JARVIS ROG Acceptance Report

> **Do not pre-fill PASS.** Replace `NOT RUN` only with evidence observed on the
> physical ASUS ROG Phone 8 Pro. An untested row stays `NOT RUN`. A row that was
> tried and failed is `FAIL` with the observation, never a silent omission.
>
> Section numbers match `docs/ACCEPTANCE_TESTS.md`.

## Build under test

| Field | Value |
|---|---|
| Commit | NOT RECORDED |
| Built by | NOT RECORDED (GitHub Actions / EAS) |
| Build URL | NOT RECORDED |
| Build date | NOT RECORDED |
| APK sha256 | NOT RECORDED |
| APK size | NOT RECORDED |
| Android target | 36 (verify in the generated project) |
| Device | ASUS ROG Phone 8 Pro (AI2401), Android 16 / API 36, arm64-v8a |

## Software gates

Record where each was run, since a local pass and a CI pass are different evidence.

| Gate | Result | Where |
|---|---|---|
| TypeScript (`pnpm check`) | NOT RUN | |
| Lint (`pnpm lint`) | NOT RUN | |
| Unit tests (`pnpm test`) | NOT RUN | |
| Smoke (`pnpm smoke`) | NOT RUN | |
| `expo install --check` | NOT RUN | |
| Expo prebuild | NOT RUN | |
| Gradle debug | NOT RUN | |
| Gradle release | NOT RUN | |

## 0. Build integrity

| # | Test | Result | Observation |
|---|---|---|---|
| 0.1 | Inference engine present in APK | NOT RUN | |
| 0.2 | arm64-v8a present | NOT RUN | |
| 0.3 | OpenCL / cdsprpc declared | NOT RUN | |
| 0.4 | Installed APK sha256 matches artifact | NOT RUN | |

## 1. Launch and model lifecycle

| # | Test | Result | Observation |
|---|---|---|---|
| 1.1 | Cold launch | NOT RUN | |
| 1.2 | GGUF picker | NOT RUN | |
| 1.3 | GGUF copy | NOT RUN | |
| 1.4 | GGUF parse | NOT RUN | |
| 1.5 | Model load | NOT RUN | |
| 1.6 | Load failure is honest | NOT RUN | |
| 1.7 | Unload | NOT RUN | |
| 1.8 | Reload after background | NOT RUN | |

## 2. Local inference, offline (airplane mode)

| # | Test | Result | Observation |
|---|---|---|---|
| 2.1 | Offline English | NOT RUN | |
| 2.2 | Offline Arabic, **answered in Arabic** | NOT RUN | Paste the actual reply. |
| 2.3 | Arabic keeps code in Latin script | NOT RUN | |
| 2.4 | No unsolicited translation | NOT RUN | |
| 2.5 | Language switch takes effect | NOT RUN | |
| 2.6 | Fast | NOT RUN | |
| 2.7 | Deep | NOT RUN | |
| 2.8 | Create | NOT RUN | |
| 2.9 | Code | NOT RUN | |
| 2.10 | Cancellation | NOT RUN | |

## 3. Truthful runtime state

| # | Test | Result | Observation |
|---|---|---|---|
| 3.1 | Metrics measured, not invented | NOT RUN | |
| 3.2 | Backend reported honestly | NOT RUN | |
| 3.3 | Running plan is shown | NOT RUN | |
| 3.4 | Thermal honesty | NOT RUN | Expected: "not measured" until the native bridge exists. |
| 3.5 | Observed power values | NOT RUN | |
| 3.6 | Adaptive off pins the runtime | NOT RUN | |
| 3.7 | Unload clears the plan | NOT RUN | |

## 4. Memory, projects, continuity

| # | Test | Result | Observation |
|---|---|---|---|
| 4.1 | Memory persists | NOT RUN | |
| 4.2 | Memory deletion | NOT RUN | |
| 4.3 | Memory is reference data, not commands | NOT RUN | |
| 4.4 | Project persists | NOT RUN | |
| 4.5 | Continuity is accurate | NOT RUN | |
| 4.6 | Project switching | NOT RUN | |
| 4.7 | Data survives upgrade | NOT RUN | Needs a second build; may lag the first pass. |
| 4.8 | Cascade cleanup | NOT RUN | |

## 5. Voice

| # | Test | Result | Observation |
|---|---|---|---|
| 5.1 | Permission | NOT RUN | |
| 5.2 | Permission denial is honest | NOT RUN | |
| 5.3 | STT is real | NOT RUN | Record the phrase spoken and the transcript returned. |
| 5.4 | Model-not-ready honesty | NOT RUN | |
| 5.5 | Stop releases the mic | NOT RUN | |
| 5.6 | Background releases the mic | NOT RUN | |
| 5.7 | Rapid start/stop | NOT RUN | |
| 5.8 | TTS | NOT RUN | |
| 5.9 | TTS language | NOT RUN | |

## 6. Tools and the Termux bridge

| # | Test | Result | Observation |
|---|---|---|---|
| 6.1 | Termux absent | NOT RUN | |
| 6.2 | Termux auth | NOT RUN | |
| 6.3 | Unknown action rejected | NOT RUN | |
| 6.4 | Unknown tool rejected | NOT RUN | |
| 6.5 | GBNF grammar accepted by llama.cpp | NOT RUN | **Never executed on device.** Confirm before relying on constrained tool calls. |
| 6.6 | Tool audit | NOT RUN | |
| 6.7 | Confirmation boundary | NOT RUN | |
| 6.8 | No arbitrary shell | NOT RUN | |

## 7. Optional online AI hub

| # | Test | Result | Observation |
|---|---|---|---|
| 7.1 | WebView login | NOT RUN | |
| 7.2 | Free-only guard | NOT RUN | |
| 7.3 | No silent paid switch | NOT RUN | |
| 7.4 | Streaming | NOT RUN | |
| 7.5 | Online persistence | NOT RUN | |
| 7.6 | Token expiry handled | NOT RUN | |
| 7.7 | Local works with internet off | NOT RUN | |
| 7.8 | Portal isolation | NOT RUN | |

## 8. Stability and thermals

| # | Test | Result | Observation |
|---|---|---|---|
| 8.1 | 10-minute representative run | NOT RUN | |
| 8.2 | Sustained throughput | NOT RUN | Record tok/s at start and at 10 min. |
| 8.3 | No OS kill | NOT RUN | |
| 8.4 | Recovery after the run | NOT RUN | |

## 9. Data control

| # | Test | Result | Observation |
|---|---|---|---|
| 9.1 | Erase all | NOT RUN | |
| 9.2 | Erase is complete | NOT RUN | |

## Measured performance

Only fill these from values the runtime actually reported.

| Field | Value |
|---|---|
| Model | NOT RECORDED |
| Quantization | NOT RECORDED |
| Model size | NOT RECORDED |
| Runtime tier | NOT RECORDED |
| Context | NOT RECORDED |
| Batch | NOT RECORDED |
| Threads | NOT RECORDED |
| GPU layers requested | NOT RECORDED |
| Observed backend (`gpu` / `reasonNoGPU`) | NOT RECORDED |
| TTFT | NOT RECORDED |
| Tokens/sec (start) | NOT RECORDED |
| Tokens/sec (10 min) | NOT RECORDED |
| Peak RAM | NOT RECORDED |

## Known gaps carried into this build

Stated up front so they are not rediscovered as surprises.

- **Thermal status is not read.** `PowerManager.getCurrentThermalStatus()` needs
  a native bridge. Adaptive sizing currently uses battery, charging and RAM
  only, and reports the thermal signal as absent. Battery temperature is
  deliberately not substituted.
- **The GBNF grammar has never been executed by llama.cpp.** It is unit-tested
  for structure only. Test 6.5 is the first real check.
- **Nothing sets `RunCompletionInput.grammar` yet.** The plumbing exists; no
  code path enables constrained tool calling.
- Stage 2 items (Shizuku, Assistant role, MediaProjection, Accessibility,
  Quick Settings tile, wake word) are NOT IMPLEMENTED.

## Outstanding problems

Record every issue found. Do not hide incomplete hardware validation.

| # | Problem | Severity | Status |
|---|---|---|---|
| 1 | Raw heard/asked text posted to the public live channel | High (privacy) | Fixed a5b2471 — word counts by default |
| 2 | phone.call could dial without confirmation | High (side effect) | Fixed ab1dc21 — dialler only |
| 3 | GitHub Actions verify-and-build never starts (account billing) | Info | Owner-acknowledged; EAS builds unaffected |

## Session 8 — 26 Sep 2026 (handoff pack integration)

Source commit `7813fe4` (+ setup script `5bd0f0b`). EAS build `5e5991f6-7059-4f56-8d88-79a58a511122`,
preview, FINISHED 05:06 UTC. APK: https://expo.dev/artifacts/eas/v9B55KckY1CwC0c2GLoccdSAGvu66LE9DrxnTod35nk.apk

| Gate | Result | Evidence |
|---|---|---|
| 1 Build — typecheck, lint, tests, smoke | PASS | 370/370 vitest, `pnpm smoke` PASS, `tsc` and lint clean (local, this session) |
| 1 Build — Gradle release | PASS | EAS log: BUILD SUCCESSFUL in 11m 50s, 0 Kotlin errors; expo-jarvis-brain/overlay/phone compileReleaseKotlin |
| 1 Build — native libs in APK | PASS (log), phone check pending | log shows rnllama_v8_2_dotprod_i8mm(+hexagon_opencl) built for arm64-v8a. APK zip not inspectable here (expo.dev → sandbox proxy 403); `scripts/rog-setup.sh` now prints SHA-256 and refuses to install unless librnllama*, audio-api and the JS bundle are inside |
| 2 Real phone | NOT RUN (this build) | brain load on device proven on bc047ad7 (owner video); this build awaits the owner's live-link test |
| 3 Video-2 parity (time, maths, system info, site search, language switch, share) | PASS in unit tests; device NOT RUN | tests/utilityCommands.test.ts (32) |
| 4 Privacy: live log word counts by default | PASS in unit tests | tests/transcriptPolicy.test.ts — dictated name/number/code absent from snapshot() and toText() |
| 4 Calls never auto-dial | PASS in unit tests + manifest | ACTION_DIAL only, CALL_PHONE removed; tests/callDialer.test.ts |
