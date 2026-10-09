# Core + Free APIs — Checkpoint 1: inventory and baseline

Branch `feat/core-face-freeapis`, cut from `feat/voice-10x-integrated` @ `fe4111a`
(that line already holds the voice work this brief builds on). Nothing merged, nothing
published. Date of inventory: 2026-09-30.

Every row is read from the code, not from earlier notes. "untested" means no device run.

## Gates on the baseline (fe4111a)

| Command | Result |
|---|---|
| `pnpm check` (tsc --noEmit) | pass |
| `pnpm lint` (expo lint) | pass |
| `pnpm test` (vitest) | 53 files, 431 tests, pass |

Package manager is pnpm; scripts confirmed in `package.json` (`check`, `lint`, `test`, `smoke`, `verify`).

## Device baseline

| Item | Value |
|---|---|
| Device / OS | ASUS ROG Phone 8 Pro, Android 16 (owner's phone) |
| Phone connected to this sandbox | **No** (`adb` not present) |
| Latest built commit | e7311e8, EAS build f597d161 |
| Cold / warm launch, end-of-speech→first-audio, frame time, memory | **pending device** — nothing measured, nothing estimated |
| Known failures from the owner's own recordings | `<think>` text on screen and spoken; speech-to-text word salad; ~37 s before first word on long answers (all on builds before the streaming-speech work; current-build behaviour unknown until re-run) |

## Inventory

| Piece | Status | Where |
|---|---|---|
| Orb | **working, wrong look**: blue "reactor" (react-native-svg + `Animated` native-driver layers), not the red/teal LED Core; has a compact mode and reduced-motion check; sits inside a HUD with text, cards and a drawer | `components/JarvisOrb.tsx`, `lib/hud/orbGeometry.ts`, `components/JarvisHud.tsx` |
| Orb states | **working**: `OFFLINE PREPARING READY LISTENING THINKING SPEAKING TOOL_RUNNING WATCHING ERROR`, derived from real signals | `lib/hud/hudState.ts` |
| Skia | **absent** (not in `package.json`). react-native-svg is the proven renderer; Skia stays unadopted | — |
| Audio capture / STT | **working, untested on latest build**: react-native-audio-api PCM → ExecuTorch Whisper-tiny + FSMN VAD; mic muted while JARVIS speaks | `hooks/useLiveVoice.native.ts`, `lib/voice/executorch.native.ts`, `lib/voice/transcriptClean.ts` |
| Wake word | **incomplete / opt-in**: speech-keyword gate is default; openWakeWord engine behind a beta switch, off by default, falls back automatically | `lib/voice/wakeWord.ts`, `wakeGate.ts`, `wakeWordEngine*.ts` |
| VAD / endpointing | Whisper-side FSMN VAD only; **no Silero, no pre-roll ring buffer, no explicit trailing-silence tuning** in this line (a version exists on `feat/voice-10x`, unmerged) | — |
| TTS | **working**: Kokoro (neural, optional download) with system `expo-speech` fallback; ranked voice selection | `hooks/useNeuralVoice.native.ts`, `lib/voice/voiceResponse.ts`, `voiceCatalog.ts` |
| Streaming speech | **working, untested on device**: sentence segmentation while the model generates; ordered neural queue | `lib/voice/speechStream.ts`, `neuralSpeechQueue.ts` |
| `<think>` removal | **working**: `stripThinking` at `speakResponse` and `speakQueued`, streaming `createThinkFilter` in the inference stream, `enable_thinking:false` default, cloud text stripped, eyes stripped. Display path in chat renders `result.text` from the same stripped completion | `lib/voice/stripThinking.ts`, `lib/inference/standaloneModel.native.ts` |
| Conversation state | working, but **not a single VoiceSessionController**: state is split across `JarvisHud` refs, `useLiveVoice`, `JarvisContext.ask`. No turn IDs, no cancellation token; barge-in helper exists (`bargeIn.ts`) | `components/JarvisHud.tsx`, `context/JarvisContext.tsx` |
| Local inference | **working**: llama.rn, Qwen3-8B primary / 4B fallback, CPU dotprod+i8mm. The brief says the 4B is GPU-accelerated and measured 5.7 tok/s; **this repo runs CPU**, and no GPU path or tok/s figure is recorded here. That claim is not adopted until verified | `lib/inference/standaloneModel.native.ts` |
| Deterministic routes | **working**: time, date, calculator, websites/search, system info, language switch, phone actions, open app | `lib/tools/deterministicRouter.ts`, `utilityTools.ts`, `lib/utils/voiceMath.ts` |
| Timers, notes by voice | **absent** as deterministic routes (memory exists, but no timer/note command) | — |
| Cloud brain | **working**: Groq → Cerebras → Gemini (Gemini only with an explicit training opt-in), plan `local / cloud-only / cloud-then-local` | `lib/online/cloudBrain.ts`, `cloudPlan.ts`, `cloudKeys.ts` |
| Puter | **present, off the essential path**: a WebView gateway on the Online page only; `JarvisContext` never calls it. The brief's "free monthly allowance, gate it" needs a policy wrapper that does not exist yet | `components/PuterGateway.*`, `lib/online/puter*.ts`, `app/(hud)/online.tsx` |
| "Free AI Hub / Model Guard" | **present, UI-level only**: `onlineFreeOnly` filters the model list and blocks non-`:free` picks in that screen. It is **not** enforced across network adapters | `lib/online/modelCatalog.ts`, `app/(hud)/online.tsx` |
| Provider policy (AED 0) | **absent**: no module classifying routes; no manifest | — |
| Free-API tools (`freeApis.ts`) | **absent** | — |
| Weather / prayer / Quran / headlines / QR | **absent** | — |
| Metrics | partial: `scripts/measure-voice-latency.mjs`, `lib/inference/performance.ts`; no on-device stage timer | — |
| Live test link | working; metadata-only by default | `lib/telemetry/*` |

## Corrections to the brief, recorded so nobody re-derives them

1. The brief assumes the 4B runs on GPU at 5.7 tok/s. This repo's own settings note records the GPU path measured at 5.9 tok/s with Q4_K_M **and hanging System UI while loading**, which is why CPU (dotprod + i8mm) is the default and GPU is an opt-in switch. Kept as is: no new model, no 1–2B downgrade, no change of default without a device measurement.
2. The brief says "Free AI Hub + Model Guard exist". They exist as a screen-level filter only.
3. Puter is a WebView side page, so "gate it" means adding a policy entry and a hard stop, not ripping out a core dependency.
4. `<think>` handling (brief checkpoint 2) is largely already in this line; checkpoint 2 becomes audit-and-test-gaps rather than new work.

## Plan against the brief's checkpoints

| # | Checkpoint | Baseline says |
|---|---|---|
| 1 | Inventory + baseline | this file |
| 2 | `<think>` kill + input clear | mostly done; add missing tests (display path, input clear after send, unclosed tag across stream) |
| 3 | Tap-to-talk local command, `VoiceSessionController`, turn IDs, cancellation | real work: controller + cancellation |
| 4 | Streaming TTS + latency probe | streaming exists; add stage-timing probe |
| 5 | Core renderer | rebuild look on react-native-svg; wire to `HudState`; declutter main layer |
| 6 | Weather + prayer, provider policy | new |
| 7 | Wake + VAD + barge-in | Silero/pre-roll are new; barge-in only if echo-safe |
| 8 | Quran, QR, notes, headlines | new |
| 9 | Device actions, regression, profiling, audit, demo | new |

Device gates: all NOT RUN.
