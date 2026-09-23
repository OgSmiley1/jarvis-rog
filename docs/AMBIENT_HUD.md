# The ambient HUD

**Status:** implemented in source, verified by the software gates below, **not yet
seen on the ROG Phone.** No APK has been produced from this branch. Nothing in
this document is a claim about on-device behaviour.

## What changed

JARVIS had eight tabs — Coach, Chat, AI Hub, Projects, Memory, Understand,
Reflect, Settings. Eight tabs is a filing cabinet. An assistant that has to be
navigated to is not ambient, and the tab bar was costing a permanent 68 px of a
voice-first screen to let the owner choose between workspaces he addresses by
speaking anyway.

There is now **one screen**: the orb, what JARVIS is doing, what it last said,
and one command line.

| Was a tab | Now |
| --- | --- |
| Coach | The HUD itself — it was already the runtime screen |
| Chat | Sheet, from the drawer. Still holds the slash routing and mode selector |
| AI Hub | Sheet, from the drawer (`/online`, unchanged) |
| Projects | Sheet, plus the active project and its next action pinned under the orb |
| Memory | Sheet, plus "Save memory" directly on any response |
| Understand | Sheet. Chat still deep-links into it with `mode` and `source` |
| Reflect | Sheet |
| Settings | Gear, top right of the drawer |

**Nothing was deleted.** Every route still exists at the same path, so
`router.push('/understand')`, `/settings?section=diagnostics` and the
deterministic slash routing in `chat.tsx` all keep working. The route group was
renamed `app/(tabs)` → `app/(hud)`, which does not change any URL, and
`app/(hud)/_layout.tsx` is a `Stack` instead of `Tabs`. The workspaces open as
bottom-sheet modals over the HUD.

## The orb

`components/JarvisOrb.tsx` is an arc reactor: a slow outer ring, a
counter-rotating inner ring, and a core that breathes.

The core's scale is driven by **measured microphone RMS**, not by a timer.
`lib/voice/audioLevel.ts` computes the RMS of each PCM frame the recorder
actually delivered, maps it across a speech-shaped decibel window (−60 dBFS to
−10 dBFS), and smooths it asymmetrically — fast attack so the ring answers the
voice, slow release so it does not flicker between syllables. With no session
capturing, the level is 0 and the orb rests. Frames dropped by the
self-listening guard set the level to 0 rather than showing JARVIS reacting to
itself.

It is built from `Animated` and transforms only — no SVG, no Skia, no
Reanimated. That keeps it inside the existing dependency set and on the native
driver, so it does not compete with token streaming for the JS thread.
`AccessibilityInfo.isReduceMotionEnabled()` stops the rotation loops when the
owner has asked the system for less motion.

Colour carries state: cyan ready/listening/thinking, amber speaking, green
executing a tool, red faulted, grey no model loaded.

## What the orb says

`lib/hud/hudState.ts` is a pure function from runtime signals to one word and
one line, in English or Arabic. Two rules it enforces by construction:

- **What JARVIS is doing outranks what it can do.** A tool executing beats
  speaking beats generating beats listening.
- **An unloaded model is never READY.** `unloaded` reads OFFLINE, `loading`
  reads PREPARING, and the detail line says to import a GGUF. There is no
  optimistic fallback, and the status strip reports acceleration only as
  `modelState.gpu` / `reasonNoGPU` actually reported it — "Not measured"
  otherwise.

Unit tested in `tests/hudState.test.ts` (8 cases) and
`tests/audioLevel.test.ts` (7 cases).

## Barge-in

An ambient assistant with no tab bar needs a way to stop it that is faster than
it is. `lib/voice/bargeIn.ts` matches a whole-utterance halt in English or
Arabic — "stop", "be quiet", "توقف", "خلاص" — and the HUD handles it directly:
stop TTS, stop generation, clear the awake window. It never reaches the model,
so the halt is not as slow as the thing being halted. Matching is deliberately
narrow: "stop the car at the roundabout" is a question, not a halt
(`tests/bargeIn.test.ts`).

One honest limit: while JARVIS is **speaking**, the recorder's frames are
deliberately discarded so it cannot transcribe its own voice, so a *spoken*
halt cannot be heard in that window. **Tapping the orb is the barge-in for
that case** — a tap while speaking or generating means stop, not "end my
microphone session". A halt spoken while it is generating does reach the
transcriber and stops the run before it is read out.

## Fast path

`lib/tools/deterministicRouter.ts` already resolved maps, app launches, the
dialer, the email composer, URLs and Termux status without an LLM call, in both
languages. This branch adds Spotify, Telegram, Instagram and Armoury Crate to
the known-app table.

It routes through the audited tool registry — structured call, schema
validation, confirmation policy, allowlisted executor, audit record — rather
than through a shell string. That boundary is the reason JARVIS can be given
this much reach safely, and it is not negotiable for speed.

## The assist gesture

`plugins/withJarvisAssistant.js` registers JARVIS as an Android
`VoiceInteractionService`. When the owner selects it as the device Digital
Assistant, long-press-home opens `JarvisVoiceInteractionSession`, which hands
off to `MainActivity`. With the tab bar gone, **that hand-off now lands on the
orb** rather than on a workspace grid — the ambient entry point came for free
from the navigation change, with no new native code.

A true floating overlay drawn on top of other apps
(`TYPE_APPLICATION_OVERLAY` + `SYSTEM_ALERT_WINDOW`) is a different mechanism
and is **not implemented**. It would need a new Kotlin Expo module alongside
`modules/expo-thermal-status/`, a runtime `Settings.canDrawOverlays` consent
flow, and its own foreground service. It is deliberately deferred until an APK
from this branch has been produced and validated: the repository already
carries unverified native surface (the assistant services, the thermal bridge),
and adding more before any of it has compiled on a real toolchain would make a
failure harder to localise, not easier.

## Verified for this change

Run against the real toolchain in this session, not asserted:

| Gate | Result |
| --- | --- |
| `pnpm check` (tsc strict) | pass, 0 errors |
| `pnpm lint` | pass, exit 0 |
| `pnpm test` | pass, 23 files, 123 tests |
| `pnpm smoke` | pass, 11 checks |
| `npx expo prebuild --platform android --clean` | pass, no warnings |
| Generated manifest | both assistant services, `BIND_VOICE_INTERACTION`, `FOREGROUND_SERVICE_MICROPHONE` and both `res/xml` configs present |

**Not verified:** Gradle compilation, an APK, and every on-device behaviour
above. `dl.google.com` is denied by this environment's egress policy, so no
Android SDK or AGP artifact can be fetched and no APK can be produced here.
That remains an EAS or GitHub Actions gate, exactly as `.claude/JARVIS_STATE.md`
records.
