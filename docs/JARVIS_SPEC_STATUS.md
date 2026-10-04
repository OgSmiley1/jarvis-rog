# JARVIS — status against the owner's execution spec (3 Oct 2026)

Every row reads **Built** (code exists, tests pass), **Built · phone NOT RUN**
(compiled into an APK, never exercised on the ROG), or **Gap**. Nothing here was
tested on a phone: no Android device is reachable from the build machine.

## 1. What the repo already had

Expo SDK 54 / RN 0.81 app, package `com.app.localjarviscoach`, one screen (no tabs).
- **Brain:** llama.rn running Qwen3 GGUF on the phone.
- **Voice:** Whisper STT and Kokoro TTS via ExecuTorch, with the phone's own engines as fallback.
- **Core:** a Skia animated Core (`components/JarvisOrb.tsx`, `components/core-layers`, `lib/core/*`).
- **Tools:** a zod-typed tool registry (`lib/tools/registry.ts`).
- **Online:** a zero-cost provider policy (`lib/net/providerPolicy.ts`) and an HTTP client with timeout, retry and circuit breaker.
- **Turns:** a voice-turn controller with cancellation (`lib/voice/voiceSession.ts`).
- **Merge:** ChatGPT's 0.4.1 (PR #11) is merged into this line.

## 2. Spec sections

| § | Requirement | Status | Where |
|---|---|---|---|
| A | Animated Core, deterministic states, 350 ms eased transitions | Built · phone NOT RUN | `CorePresets.ts` (7 states: idle, listening, transcribing, thinking, speaking, interrupted, error), `useCoreController.ts` |
| A | Core survives subsystem failure | Built | `CoreErrorBoundary.tsx` + plain-View fallback Core (`fallbackCore.ts`) |
| A | Reduced motion / battery saver / thermal | Built · phone NOT RUN | `StaticCore`, thermal caps in `adjustParams` |
| A | Separate visuals for "executing action", "online lookup", "success", "warning" | Built · phone NOT RUN | `applyActivity` bends the state's preset: **tool** = tight fast sweep, dense spokes, readout EXECUTING · **online** = six wide rings, teal leads, ONLINE LINK · **success** = one bright breath, 0.9 s, COMPLETE · **warning** = dim and slow, 1.6 s, CAUTION (distinct from error). Same 350 ms ease. Set by the HUD from the routed tool and the turn's outcome |
| B | Reuse an installed brain; never re-download | Built | `brainStore.findInstalledModel`; `scripts/rog-setup.sh` keeps a 4B or 8B already present |
| B | One-time 4B download if absent | Built | setup script (2.5 GB, size-checked) + in-app fallback |
| B | Load brain with no Settings step | Built · phone NOT RUN | loads as soon as file access is granted (`shouldLoadAfterAccess`) |
| B | Cancellation, streaming, short spoken replies | Built · phone NOT RUN | turn AbortSignal; sentence streaming; 128-token fast cap |
| B | Show model size / RAM / free storage | Built | Settings → Your JARVIS: size, estimated RAM need (weights + ~0.7 GB, labelled "~"), phone RAM, free storage, offline-ready (`brainFacts`) |
| C | Tap-to-talk, wake word (beta), barge-in, no overlapping TTS | Built · phone NOT RUN | `VoiceSessionController`, TTS FIFO queue |
| C | Voice barge-in (talk over JARVIS) | Built (beta, off by default) · phone NOT RUN | Settings → *Talk over JARVIS (beta)*: the mic stays open while it speaks; a software echo guard (`echoOverlap`) drops anything that is mostly JARVIS's own recent words; "stop" halts, anything else halts and is handled as the next request |
| C | Speaking animation from real playback | Built · phone NOT RUN | neural voice (Kokoro, English): spokes follow the **measured** RMS loudness of the very samples played, 20 ms frames, read against the audio clock. Phone's own voice (Arabic) exposes no audio: the labelled synthetic rhythm, gated by real playback |
| C | English + Arabic, mixed prompts | Built | router + duration parser handle both |
| D | Typed tool registry with schema + handler | Built | zod schemas; the self-test checks every tool |
| D | Phone, calendar, timers, alarms, apps, settings, weather, prayer, Quran, news, QR, jokes, quotes, calc | Built · phone NOT RUN | `lib/tools/*` |
| D | Honest results ("opened dialer", never "call completed") | Built | calls open the dialer; the owner taps Call |
| D | Per-tool permissions, network use, timeout, outcome | Built | `lib/tools/toolProfiles.ts` for all 42 tools; the router enforces each time limit (TOOL_TIMEOUT); a test fails if a tool has no profile; outcome "opens-screen" for dialer/SMS/calendar |
| 3 | Structured follow-ups ("and tomorrow?", "what about Dubai?") | Built — **improved today** | `nextLiveContext` keeps tool + city + day; a city follow-up now keeps "tomorrow"; any other topic clears the context; 2-minute expiry |
| 4 | Online is optional; budgets; nothing paid | Built | strict zero-cost mode, Puter hard stop, Gemini behind its own switch |
| 4 | **Strict-local switch: nothing leaves the phone** | Built — **new today** | Settings → *Local only (no internet)*: refuses every provider in the policy **and** in the cloud brain plan; status line says "local only" |
| 4 | LOCAL vs ONLINE shown | Built | status line: "local only" / "offline"; Live info card |
| 5 | Session / preferences / memory, inspect + clear | Built | Memory screen, Settings → Data → Erase all; memories backed up to `Download/JARVIS` |
| 7 | Modular architecture | Built | `lib/core`, `lib/inference`, `lib/voice`, `lib/tools`, `lib/memory`, `lib/online`, `lib/net` |
| 8 | Startup: Core first, then brain, no setup screens | Built · phone NOT RUN | |
| 9 | Permissions asked when relevant, degrade on denial | Built · phone NOT RUN | Phone access card; tools return readable errors |
| 10 | Failure boundaries | Built | Core boundary, http result types, per-tool timeout (and the turn deadline sized from it, so the camera's look is not cut at 15 s), readable errors ("No brain is loaded yet — phone tools, timers and live info still work.") |
| 11 | Latency measurement | Built | `stageTimer` (median / p95 / n), `scripts/measure-voice-latency.mjs`. **No phone numbers yet.** |
| 15 | Diagnostics page + **one-tap self-test** | Built — **new today** | Settings → Advanced → Diagnostics: app version, Android version, ABI, RAM, and *Run self-test* (Core, tools, routing, follow-ups, internet policy, reasoning hidden, brain, network) |

## 3. Tests and builds (exact)

- `pnpm check` (tsc): pass. `pnpm lint`: pass. `pnpm test`: **632 passed, 66 files**. `pnpm smoke`: pass.
- `expo export --platform android`: Hermes bundle produced (7.1 MB export).
- EAS build `5ee1f804` on b69fa61: **BUILD SUCCESSFUL in 11m 44s**, 0 Kotlin errors.
  - Compiled: Skia (`shopify_react-native-skia`, CMake), Reanimated + worklets, llama.rn (CMake), expo-jarvis-phone.
  - APK: `https://expo.dev/artifacts/eas/2jnrduqaZOC6770QlZRt5lmivig42HenXS2QF_UPdeU.apk`, version 0.4.1 (2026093001).
  - Superseded by the final build below.
- **Final EAS build `f476851a` on 5cc54dc** (everything in this report): **BUILD SUCCESSFUL in 11m 9s**, 0 Kotlin errors.
  - Compiled: Skia (CMake), Reanimated + worklets, llama.rn (CMake), expo-jarvis-phone.
  - APK: `https://expo.dev/artifacts/eas/yZO9Pnnfsl7usDyytW2kFRAzQrDkf8uE3DIqkirfErM.apk`.
  - `scripts/rog-setup.sh` installs this APK.

## 4. Device tests performed

**None.** Every phone gate stays NOT RUN until the owner installs:
- Core frame rate
- microphone to transcript
- brain load
- first token
- TTS
- barge-in
- intents
- offline and reconnect
- cold restart
- low memory

The self-test is the first thing to run on the phone.

## 5. Known limits

- **Voice barge-in is a beta:** no hardware echo cancellation is verified on the ROG. The software echo guard filters JARVIS's own words, but the speaker's sound can still blur what Whisper hears. Earphones work best. With the beta off, tapping the Core interrupts.
- **Arabic speech animation:** Arabic replies use the phone's own voice, which exposes no audio, so the Core shows the labelled rhythm instead of real loudness.
- **APK contents:** checksum and size are not verifiable from the build machine (the artifact host is blocked by its proxy). The setup script checks the install on the phone.
- **Signing:** ChatGPT's test-signed 0.4.1 APK uses a different key. The setup script uninstalls it first. The brain, voices and memory backup in `Download/JARVIS` are kept.
- **No phone measurements yet:** latency, FPS and RAM use come from the stage timer and self-test once the owner runs them.
