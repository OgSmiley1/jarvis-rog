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
