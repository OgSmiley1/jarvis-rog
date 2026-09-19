# Stage 2 Android Native Integrations

These are **optional adapters after the local core is stable**. They must not be represented as complete until implemented and physically tested.

## 1. Default assistant role

Use Android's supported role/service APIs where available. Detect support first and present an explicit Settings action. Never silently replace another assistant.

Implementation checklist:

- inspect target Android API behavior for `ROLE_ASSISTANT`
- add native Android module/config only when required
- expose `isAvailable`, `isHeld`, `requestRole`
- return the real result to React Native
- preserve app operation when unavailable

## 2. MediaProjection screen understanding

Flow:

```text
Owner taps Understand Screen
 -> Android MediaProjection consent UI
 -> capture one frame
 -> local OCR/vision adapter
 -> user-visible extracted context
 -> local reasoning
 -> discard frame unless owner explicitly saves it
```

Do not run silent background capture.

## 3. Accessibility helper

Accessibility is disabled by default. If the owner enables it, use semantic accessibility nodes rather than blind coordinate replay.

Automation loop:

```text
inspect -> propose/validate action -> execute -> inspect -> stop on mismatch
```

Any text-entry/tap automation with meaningful side effects should stay behind the tool policy/confirmation layer.

## 4. Shizuku

Expose capability states:

- UNAVAILABLE
- NOT_INSTALLED
- NOT_RUNNING
- PERMISSION_REQUIRED
- READY

Add each Shizuku operation as one explicit allowlisted tool. Do not add an arbitrary shell tool.

## 5. Quick Settings tile

A tile can provide a reliable JARVIS launch/session shortcut without relying on unsupported OEM hooks. Keep it optional and user-configurable.

## 6. OEM-specific ROG features

Do not claim programmatic control of AirTriggers, Aura lighting, fan curves, X Mode, or Armoury Crate until a supported/verified interface is found on the exact device/firmware. Treat undocumented behavior as experimental and isolate it from core functionality.
