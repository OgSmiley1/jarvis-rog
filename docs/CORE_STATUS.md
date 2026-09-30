# Core + Free APIs — status

Brief: unified zero-cost build pack (2026-09-30). Its verdict section is the correction list.

| Field | Value |
|---|---|
| Branch | `feat/core-face-freeapis` (from `feat/voice-10x-integrated` @ fe4111a) |
| Merge / release build | not done — needs the owner's word |
| Commands | `pnpm check` · `pnpm lint` · `pnpm test` · `pnpm smoke` · `node scripts/measure-voice-latency.mjs <log>` |
| Gates now | check pass · lint pass (0 warnings) · 553 tests pass (baseline 431) · smoke pass · `expo export --platform android` pass |
| Phone build | EAS `a74eca05` on a92a03c: **BUILD SUCCESSFUL in 14m 45s, 0 Kotlin errors**; Skia (CMake), Reanimated + worklets (version check passed), expo-jarvis-phone, expo-network compiled. APK: https://expo.dev/artifacts/eas/I2b2uKkXb6_MD8xpd9KKAu9B_RO3b2VAJkUsxMkRKSo.apk (the setup script checks it on the phone; expo.dev is blocked from the build sandbox) |
| GitHub `verify-and-build` | never runs: account Actions billing (no runner, 2 s, no logs). Not a code failure |
| Device | ASUS ROG Phone 8 Pro, Android 16 — **no device in this sandbox; every device gate NOT RUN** |

## Checkpoints

Labels: **impl + unit-tested** means code and off-device tests exist; **device-test pending** means nobody has run it on the ROG yet. Nothing below is device-tested.

| # | Checkpoint | State |
|---|---|---|
| 1 | Inventory + baseline | done → `docs/CORE_BASELINE.md` |
| 2 | `<think>` leak + input clear | impl + unit-tested (7 tests on speaker, stream, segmentation, screen); input now cleared after every send, success or failure. Device-test pending |
| 3 | Tap-to-talk, VoiceSessionController, cancellation | impl + unit-tested: turn IDs, AbortSignal, deadline, supersede-cancels, late results dropped, 3 tool ops / 2 concurrent reads. Tap the Core = talk / stop. Device-test pending |
| 4 | Streaming TTS + latency probe | streaming was already in; new stage timer (speech end measured on the audio, dispatch, tool/model, first token, TTS queued, first audio) with median/p95/n per scenario, shown in the menu, logged as `LATENCY`, tabulated by `scripts/measure-voice-latency.mjs`. Airplane-mode run pending |
| 5 | Core renderer + lifecycle | impl on react-native-skia to the visual guide (see `docs/CORE_VISUAL.md`): presets unit-tested, APK built. Main layer = Core only. Frame-time/CPU measurement pending |
| 6 | Weather + prayer, cache, errors, policy | impl + unit-tested (34 tests): Open-Meteo, Aladhan (date + zone verified), per-city method, midnight expiry in the city's zone, stale-with-age offline, policy fail-closed. Live endpoints not reachable from this sandbox (proxy 403) — first real call happens on the phone |
| 7 | Wake + VAD + interruption | openWakeWord engine already opt-in (from the integrated line); energy endpointer with 250 ms pre-roll ported and used to time end of speech; barge-in rule (≥ 2 words, echo-safe only) is the code path; **this build is half-duplex** (mic muted while speaking; tap to interrupt) because no echo cancellation is verified. Silero VAD not added (see gaps) |
| 8 | Quran, QR, notes, headlines, translation | Quran exact (edition + verse verified, never generated); QR encoded on the phone; voice notes; Guardian with the owner's free key; Spaceflight (labelled space-only); jokes/quotes with local fallback; GeoJS opt-in. Translation: **no demonstrated working path** → not wired as a tool (LibreTranslate is `unknown` → refused) |
| 9 | Device actions, regression, profiling, audit | timers + alarms through the Clock app (new native `setTimer`/`setAlarm`, reported as "asked the Clock app", not "running"), settings panels. AED 0 audit is a test. Sustained profiling, 100-turn run, battery: pending device |

## Measurements

None on the device yet. The phone will produce them: open the menu (long-press the Core) to see median/p95/n, or turn on the live link and run `node scripts/measure-voice-latency.mjs log.txt`.

## Gaps (exact)

- Every device gate — latency p95s, fps/jank, idle CPU, memory growth, thermals, battery, 100-turn reliability, airplane mode, headphones/BT/calls/recreation.
- Free-API endpoints were not reachable from the build sandbox (proxy 403); adapters follow the providers' documented schemas and reject anything else. First live call happens on the phone.
- Silero VAD: not added. The recogniser already runs FSMN VAD; the energy endpointer times speech end. A neural VAD would need an ONNX/ExecuTorch model on the phone — deferred until the basic loop is measured.
- Full-duplex barge-in: off until echo cancellation is verified on this phone.
- Speaking animation is a speech-activity rhythm; the system TTS gives no amplitude.
- Translation: unavailable (no verified free path; local brain can still be asked in conversation).
- CleanURI shortener: not added (optional, terms unverified).

## Next action

Owner installs the build, runs the five-step demo in `docs/CORE_DEMO.md` with the live link on; then the measured numbers go into this file.
