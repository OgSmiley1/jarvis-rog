# The Core — Skia implementation notes

Built to `Jarvis_Core_visual_implementation_guide.md` by extending `components/JarvisOrb.tsx`. There is still only one orb component: the SVG version was removed.

## API check against the installed @shopify/react-native-skia 2.2.12

| Guide name | Installed 2.2.12 | Used as |
|---|---|---|
| `useClockValue` | **missing** (Skia 1.x API) | `useClock()` → Reanimated `SharedValue<number>` (ms since the first frame) |
| `useComputedValue` | **missing** | Reanimated `useDerivedValue` |
| per-frame `Skia.Path.Make()` | allowed | `usePathValue(cb)`: resets and refills ONE path per frame, so nothing is allocated per frame |
| `DashPathEffect` | present, `{ intervals, phase? }` | LED dots on the rings; teal arc segments |
| `RadialGradient` | present, `{ c, r, colors }` | hub glow and bloom |
| `TextPath` | present, `{ font, text, path, initialOffset }` | thinking readouts, font from `matchFont({ fontFamily: 'monospace' })` |
| `path.arcTo(rect, …)` | named `arcToOval(oval, startDeg, sweepDeg, forceMoveTo)` | the 24° sweep wedge |
| `transform: [{ rotate: deg }]` | rotation is in **radians** | degrees converted |

Also installed: `react-native-reanimated` 4.1.7, which the repo's `react-native-worklets` 0.6.1 supports on RN 0.81 (see reanimated's `compatibility.json`). `babel-preset-expo` adds `react-native-worklets/plugin` automatically. `expo export --platform android` produces a Hermes bundle containing the workletized Core functions.

## What each state draws

Every parameter comes from `lib/core/CorePresets.ts`, the guide's table, with a 350 ms ease between states.

| State | Rings | Spokes | Sweep | Teal arcs | Hub glow | Breath |
|---|---|---|---|---|---|---|
| idle | 3 dotted red rings | 18 % (65 of 360) | 0.05 turns/s, faint | dim, 0.25 | 0.35 | 6 px, 4 s |
| listening | 4 | 35 % | 0.15/s | full, 1.0, plus a teal hub swell from the measured mic level | 0.6 | 10 px, 1.6 s |
| transcribing | 4 | 45 % | 0.6/s | 0.6 | 0.7 | 4 px, 1.2 s |
| thinking | 5 | 60 % | 1.2/s | 0.5; circular red readouts fade in | 0.85 | 3 px, 0.9 s |
| speaking | 4 | 75 %, rippling on a speech-activity rhythm **only while TTS is actually playing** | 0.3/s | 0.7 | 0.9 | 8 px, 0.5 s |
| interrupted, 400 ms | 2 | 10 % | 2.0/s | 0.2 | 0.4 | contracts; 120 warp streaks |
| error | 2 | 15 % | 0.1/s | 0.15 | 0.25 | 2 px, 2.5 s |

Other conditions:
- **Events.** A wake word gives a red bloom (red at 1.6 for 400 ms) plus 160 white-then-red streaks. An interrupt gives 120 streaks. At most 240 streaks are ever drawn.
- **Offline.** Red is dimmed to 70 % and one 4 px grey dot appears. **Thermal throttling** (status Moderate or worse) caps the Core at 2 rings, 20 % spokes and a 0.05 sweep.
- **Reduced motion, battery saver or background.** A static frame is drawn (hub, the state's rings, teal arcs) with no clock running.

## Honest limits

- The speaking "waveform" is a speech-activity rhythm, not an audio envelope. It runs only between the TTS engine's own start and done callbacks, and the system voice gives no amplitude.
- 60 fps, idle CPU and thermals have **not** been measured on the ROG yet. The layers follow the guide's budget: one path per layer, no blur, capped particles and spokes. The measurements come from the phone.
