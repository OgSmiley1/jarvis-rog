# Core + Free APIs — status

Brief: unified zero-cost build pack (2026-09-30). Verdict section is the correction list.

| Field | Value |
|---|---|
| Branch | `feat/core-face-freeapis` (from `feat/voice-10x-integrated` @ fe4111a) |
| Merge / release build | forbidden without the owner's word |
| Commands | `pnpm check`, `pnpm lint`, `pnpm test`, `pnpm smoke` |
| Baseline | check + lint pass, 431 tests pass |

## Checkpoints

- [x] 1 Inventory + baseline → `docs/CORE_BASELINE.md`
- [ ] 2 `<think>` audit + tests
- [ ] 3 Tap-to-talk, VoiceSessionController, cancellation
- [ ] 4 Latency probe
- [ ] 5 Core renderer
- [ ] 6 Weather + prayer + provider policy
- [ ] 7 Wake / VAD / barge-in
- [ ] 8 Quran / QR / notes / headlines
- [ ] 9 Device actions, profiling, zero-cost audit

Measurements: none yet (no phone in this sandbox). Device gates: NOT RUN.

Next action: checkpoint 2.
