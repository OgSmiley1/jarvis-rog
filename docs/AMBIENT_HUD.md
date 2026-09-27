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

## Speaking while it is still thinking

The single largest latency win available at zero cost, and the reason a local
assistant used to feel dead next to a hosted one.

JARVIS previously generated the **entire** answer, then began speaking. On a 4B
model writing six sentences on a phone, that is most of a minute of silence
before the first word. `lib/voice/speechStream.ts` cuts the token stream at
sentence boundaries and hands each finished sentence to TTS while the model is
still writing the next one:

- **Time to first word** falls from *the whole answer* to *the first sentence*.
- The voice then stays ahead of the generator, because speaking a sentence
  takes longer than generating one — so after the first sentence there is no
  further waiting at all.
- Nothing is faked. A sentence is released only once its terminator has
  actually arrived in the stream.

`speakQueued()` exists alongside `speakResponse()` because the latter calls
`Speech.stop()` first — correct for one complete answer, fatal for a stream,
where each new sentence would silence the previous one and the owner would hear
only the last. The system engine keeps its own utterance queue, so successive
segments play in order.

Segmentation handles what actually breaks naive splitting: decimals and version
numbers (`3.5`), abbreviations (`Dr.`), runs of terminators (`?!` is one
boundary), Arabic punctuation (`؟`), and a model that forgets to punctuate at
all — past 220 characters it releases at the last word break rather than
waiting for a full stop that may never come. It also strips markdown, because
models leak it even when told not to and "asterisk asterisk important" is the
fastest way to make a voice assistant sound broken. 11 tests.

Barge-in is wired through a **speech epoch**: halting increments it, so
segments already queued for an abandoned answer resolve into a stale epoch and
are dropped rather than resuming after the engine's queue is cleared.

## Not sounding like a robot

Two separate problems, and the voice engine is only one of them.

### Picking the right voice

The old selection was `find(quality === 'Enhanced') ?? candidates[0]`. On
Android that is close to random: the platform reports `quality` as `Default`
for almost everything, **including Google's good neural voices**, so the filter
almost never matched and the fallback took whatever was enumerated first —
frequently the compact eSpeak-class voice that was the reason JARVIS sounded
synthetic.

What actually distinguishes the voices on the device is the identifier.
Google's engine names its neural voices `<lang>-x-<abc>-<local|network>`
(`en-gb-x-rjs-local`, `ar-xa-x-arc-local`). A bare `en-GB-language`, or
anything from `espeak`/`pico`/`svox`, is the old formant synthesiser.

`lib/voice/voiceCatalog.ts` scores every installed voice on identifier shape,
engine, locale and reported quality, then picks the best. It is pure, so the
ranking is tested off-device against a realistic snapshot of what an Android
phone enumerates — including the case that caused the bug, where a `Default`
neural voice must beat an `Enhanced` basic one. 12 tests.

`-network` voices are synthesised on Google's servers and sound the best, but
they need connectivity and add a round trip before JARVIS starts speaking. This
is a local-first assistant, so they rank **below** on-device neural voices
unless the owner turns them on in Settings.

Settings shows the voice actually in use, why it was chosen, and the ranked
alternatives — each with a **Hear it** button and a **Pin** button. A pinned
voice that is later uninstalled falls back to ranking rather than silently
staying selected. Prosody follows the voice family: the legacy engine is slowed
down because it garbles at speed, a neural voice sits just under natural pace,
and Arabic keeps natural pitch because lowering it muddies the emphatic
consonants.

### A genuinely neural voice: Kokoro, on-device

Picking the best system voice improves things, but the ceiling is whatever
the phone ships. `react-native-executorch` — already in the app for speech
recognition — also ships **Kokoro**, a neural TTS model, so a human-sounding
voice needed no new native code and no new dependency.

- **British male, "Daniel"** (`models.text_to_speech.kokoro.en_gb.daniel()`),
  the closest match in the library to the JARVIS register. Runs fully on the
  phone at Kokoro's native 24 kHz (`kSamplingRate` in the library's
  `kokoro/Constants.h`), played through `react-native-audio-api`, also
  already in the app.
- **Opt-in, ~351 MB**, measured from the Hugging Face repository at the exact
  version pinned (synthesizer 272.4 MB, duration predictor 62.4 MB, en-GB
  phonemizer 15.9 MB, voice 0.5 MB). `preventLoad` keeps it from downloading
  until the owner switches it on.
- **English only.** Kokoro has no Arabic voice. Arabic replies keep the
  phone's best voice from `voiceCatalog.ts`, and Settings says so.
- **Loaded once.** The model lives in the HUD, which stays mounted under
  every sheet; Settings reads its status through
  `lib/voice/neuralVoiceStore.ts` rather than loading a second copy.

`lib/voice/neuralSpeechQueue.ts` does the scheduling, and is pure so it is
tested off-device (9 cases): Kokoro's `forward` throws when already busy, so
synthesis is strictly one sentence at a time; the next sentence is
synthesised while the current one plays; clips are scheduled back to back on
the audio clock so there are no gaps or overlaps; a sentence that fails to
synthesise is spoken by the system voice instead, so it never goes silent;
and barge-in stops queued text, in-flight synthesis and playing audio, with
any synthesis that lands after "stop" discarded.

**Bug fixed on the way in:** with the system voice, every streamed sentence
reset "speaking" to false as it finished, so the microphone reopened while
later sentences were still playing and JARVIS could transcribe itself. The
HUD now counts pending sentences and only releases the microphone when the
last one ends — and resets that count when a new answer starts, since an
abandoned answer's sentences never decrement it.

### Writing for the ear

A neural voice reading a bulleted essay still sounds like a machine, because
nobody talks in headings and numbered lists.

When an answer is going to be spoken, `spokenStyleDirective()` tells the model
to write it the way a person speaks: short sentences, contractions, three
sentences at most unless detail was asked for, no markup, no dictated URLs or
file paths, and the answer first rather than a restatement of the question.

It applies **only** when voice output is on. Typed answers in Chat keep their
structure, tables and code blocks — the directive changes how a reply is
written, never what it says.

## It is a conversation, not a series of commands

The HUD was calling `ask()` with **no history**, so every utterance was a cold
start: "what's the weather in Ajman", then "and tomorrow?" produced an answer
to "and tomorrow?" with nothing to attach it to. A voice assistant that cannot
be followed up on is a command line you happen to shout at.

`lib/hud/conversation.ts` keeps a bounded rolling window of the last 12
messages, matching the Chat screen's. Exchanges are appended as a pair, so
history can never hold a question with no answer — a dangling user turn makes
the next prompt read as though JARVIS ignored it. It is in-memory only:
anything worth keeping goes through the existing Chat records or approved
memory, rather than a second persistence layer competing with SQLite. 7 tests.

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

## The floating orb over other apps

`modules/expo-jarvis-overlay/` draws a small arc-reactor orb over every other
app — games, maps, anything. Tap it and JARVIS comes to the front; drag it and
it snaps to the nearest screen edge.

It was deferred until a native change could actually be compiled. That
changed when EAS became reachable through the Expo connector, and the one
existing local module, `expo-thermal-status`, was confirmed from the real EAS
log to compile on Expo's servers. The overlay follows that module's structure
exactly.

- **A native View, not React.** Rendering React in a system overlay needs a
  second React root with its own JS lifecycle, roughly doubling memory while
  the orb idles over a game. The orb is a few hundred bytes of Canvas drawing
  and one animator.
- **A foreground service** (`specialUse`), because a plain service is killed
  within about a minute of the app leaving the screen. Its notification is the
  off switch: *Hide orb* stops it.
- **Never assumes the permission.** "Display over other apps" is granted in
  Android's own settings; JARVIS opens that screen and re-checks the result
  whenever it returns to the foreground. The service re-checks before every
  attach, because the permission can be revoked while it runs.
- **Never steals input.** The window is `FLAG_NOT_FOCUSABLE`, so the keyboard
  and a game's touches stay with the app underneath.
- **Autolinked from `./modules`, not added to `package.json`.** A dependency
  would change the lockfile and bust the EAS compile cache — the exact
  mechanism that pushed earlier builds into the 45-minute limit.

`tests/overlayContract.test.ts` guards the mistakes that would compile and
only fail on the phone: a manifest service no class implements, a missing
permission, mismatched module names across the bridge, and the Android 14
requirement that the manifest and `startForeground()` agree on the service
type.

**Not yet verified:** the Kotlin compiling under Gradle, and the orb on the
device. Both happen on the next EAS build from this branch.

## Verified for this change

Run against the real toolchain in this session, not asserted:

| Gate | Result |
| --- | --- |
| `pnpm check` (tsc strict) | pass, 0 errors |
| `pnpm lint` | pass, exit 0 |
| `pnpm test` | pass, 26 files, 145 tests |
| `pnpm smoke` | pass, 11 checks |
| `npx expo prebuild --platform android --clean` | pass, no warnings |
| Generated manifest | both assistant services, `BIND_VOICE_INTERACTION`, `FOREGROUND_SERVICE_MICROPHONE` and both `res/xml` configs present |

**Not verified:** Gradle compilation, an APK, and every on-device behaviour
above. `dl.google.com` is denied by this environment's egress policy, so no
Android SDK or AGP artifact can be fetched and no APK can be produced here.
That remains an EAS or GitHub Actions gate, exactly as `.claude/JARVIS_STATE.md`
records.
