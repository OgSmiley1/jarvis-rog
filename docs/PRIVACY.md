# Privacy Model

JARVIS ROG is designed around explicit owner action.

## Persistent data

Stored locally:

- app settings
- conversations
- explicitly approved memories
- project state/steps
- tool audit results

## Microphone

The normal architecture is a visible owner-started session. The app requests Android microphone permission and stops capture when the session ends, the app backgrounds, or the relevant component unmounts.

## Screen

No background screen scraping is part of the core app. Any future screen-understanding feature must use user-approved MediaProjection or an explicitly enabled Accessibility Service.

## Other apps/messages

Core JARVIS does not silently intercept third-party messages, notifications, contacts, or clipboard content. The owner can intentionally paste/share content into Understand.

## Memory

Saved memory must be inspectable, editable/deletable, and bounded when injected into prompts. Retrieved text is wrapped as untrusted reference material.

## Secrets

The Termux bridge shared secret belongs in SecureStore/Android keystore-backed storage, not SQLite/AsyncStorage/plain source.

Cloud brain keys (Cerebras, Groq, Gemini) follow the same rule: Android keystore via expo-secure-store, never SQLite, never logged, never in the repository or the APK. Settings learns only whether a key is present and never displays one back.

## When a question can leave the phone

By default, nothing JARVIS is asked leaves the device. The local GGUF model answers everything.

The **cloud brain** changes that, and only when the owner turns it on in Settings. Even then it is used only while **no local model is loaded**; a loaded local brain always answers first and nothing is sent. When it is used, the request sent to the first provider that answers contains exactly what the local model would have received:

- the system prompt, including the owner profile,
- any approved memories selected as relevant,
- the active project's continuity notes,
- the last few turns of the current conversation,
- the question itself.

Each answer on the HUD is labelled with where it came from — "On-device · never left the phone" or "Via Groq · left the phone" — so the owner never has to guess. The providers' own terms govern what they do with a request.

The Free AI Hub (Puter) is a separate, explicitly opened screen and is unaffected by this setting.


## Live test link (owner-started, public channel)

Default: states, timings, routes and errors only; the owner's words and the
replies are logged as word counts (`lib/telemetry/transcriptPolicy.ts`). An
explicit "Include what I say" switch adds words for at most 30 minutes.
Private phone data (messages, calls, contacts, calendar, camera) is never
logged. Tested in `tests/transcriptPolicy.test.ts`.
