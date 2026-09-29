# Voice 10x — status of `feat/voice-10x` (from `origin/main @ f4f6587`)

Build pack: owner's `jarvis-10x-build-pack.md` (29 Sep 2026). No merge, no release build, no billing API.
`pnpm check`, `pnpm lint`, `pnpm test` green at every commit (174 tests; 80 new voice tests in `tests/voice/`).

| Phase | Commit | Done |
|---|---|---|
| 1 Kill the leak | 79f37db | `stripThinking` (closed/unclosed/nested/stray), single TTS choke point, `enable_thinking:false` on voice turns, filtered display, input + transcript cleared per turn |
| 2 Speed | 612c790 | think-filtered token stream → sentence buffer (200-char word cut) → ordered TTS FIFO (window 2, atomic interrupt), voice turns on `fast`, warm-up, KV prefix reuse, latency probe + `scripts/measure-voice-latency.mjs` |
| 3 Loop | 792a63a | endpointer (plan's hysteresis, pre-roll, auto end), pure loop state machine, openWakeWord `hey_jarvis` (+ spoken "Jarvis" fallback), follow-up window, barge-in (≥2 words, echo guard, halt words), AEC via VoiceCommunication preset patch, mic foreground service |
| 4 Brain | 1c0f7a9 | spoken style prompt, offline-first brain order with same-turn fallback, free cloud Groq→Cerebras(→Gemini only if allowed), Kokoro English voice, executorch resource fetcher fix |
| 5 Feel | c05783c | animated orb with SPEAKING, dashboard home |

## Not verified — needs the owner's review, then one preview build and a phone test
- Native compile of: `react-native-openwakeword` 3.0.0 + `react-native-nitro-modules` 0.36.1, the `react-native-audio-api` patch, `react-native-svg`, the executorch resource fetcher. No build was run (owner's rule).
- Everything below is device behaviour: NOT RUN.

## Acceptance (ROG Phone 8 Pro)
| Criterion | Status |
|---|---|
| "hey Jarvis, what time is it" → speaking in < 5 s, no thinking on screen or audio | NOT RUN (unit: leak paths covered; latency probe ready) |
| Interrupt mid-answer by speaking → silent at once, new turn handled | NOT RUN (unit: barge-in, queue interrupt, turn serialization) |
| Two consecutive turns → nothing from turn 1 in turn 2 | NOT RUN (unit: voiceTurn, reply cancel, turn ids) |
| Airplane mode → full loop offline | NOT RUN (design: local brain + local STT/TTS; wake models need one first download) |
| `pnpm check && pnpm lint && pnpm test` green with voice tests | PASS |

## Deferred (with reason)
- Piper `ar_JO-kareem` Arabic voice via `react-native-sherpa-onnx` 0.4.4 (MIT): a second large native library; add after the first build proves the rest compiles.
- Silero neural VAD: the endpointer's score is one function; energy scoring ships first because it needs no model download and is fully testable.
- Stale `feat/handsfree-jarvis-rog` / `plugin-branch`: not merged, as instructed.
