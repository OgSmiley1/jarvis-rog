# JARVIS ROG

> **Current source candidate: Build 0.3.0.** See `docs/BUILD_PROGRESS_0.3.0.md`, `docs/ONLINE_MODELS.md`, and `.claude/JARVIS_STATE.md` for verified work, blocked build gates, and the exact next command.

A local-first Android personal assistant starter/upgrade pack for **ASUS ROG Phone 8 Pro**, designed to be merged into the existing **Local Jarvis Coach** project rather than blindly replacing validated code.

## Core target

- Android package: `com.app.localjarviscoach`
- Expo SDK 54 / React Native 0.81 / React 19 / TypeScript
- Local GGUF inference with `llama.rn`
- Fast / Deep / Create / Code profiles
- Owner-approved bounded memory
- SQLite conversations + projects + continuity
- Visible local voice session with on-device STT architecture
- Device TTS
- Safe structured tools
- Optional authenticated Termux bridge
- No root required for the core app

## What this pack is

This is a **source pack and Claude Code handoff**. It contains runnable core code, tests, scripts, schemas, a safe Termux bridge, and acceptance documents. It is intended to be applied to the existing repository after Claude audits that repository at its current checkpoint.

It deliberately does **not** fake physical-device validation. Hardware-only work such as Shizuku, Android Assistant role, MediaProjection screen capture, and OEM-specific ROG integration is staged behind capability detection and must be completed/tested on the actual phone.

## Quick start for Claude Code

1. Give Claude the existing repository plus this pack.
2. Tell Claude to read `CLAUDE_HANDOFF.md` first.
3. Claude must inspect the existing implementation before copying files.
4. Preserve existing working code where it is more complete than this pack.
5. Run `scripts/bootstrap.sh` after merging.
6. Complete `docs/ACCEPTANCE_REPORT.md` only from real test results.

## Local development

```bash
corepack enable
pnpm install
npx expo install --fix
pnpm check
pnpm lint
pnpm test
npx expo prebuild --platform android --clean
cd android && ./gradlew assembleDebug
```

The application must be tested as a native Android build. Expo Go cannot host the required native inference stack.

## Termux bridge

Termux is optional. The assistant remains useful without it.

```bash
cd termux
chmod +x install.sh start.sh stop.sh
./install.sh
./start.sh
```

Copy the generated bridge secret into **Settings → Termux bridge secret** inside JARVIS. The bridge binds only to `127.0.0.1` and exposes an allowlist of actions. There is intentionally no generic `exec_shell` API.

## Model workflow

Settings → Import GGUF → choose a trusted GGUF → Load model.

Begin with a smaller multilingual quantized model and measure actual load time, TTFT, tokens/sec, RAM pressure, and thermal behavior on the physical ROG phone before increasing model size.

## Privacy model

- No permanent hidden microphone.
- No passive third-party message scraping.
- No silent screen capture.
- Persistent memory is owner-approved and deletable.
- Tool calls pass through schema validation and, where needed, confirmation.
- Retrieved memory/documents are wrapped as untrusted reference data, not instructions.

## Repository map

- `app/` — Expo Router screens
- `context/` — integrated JARVIS state/runtime
- `lib/inference/` — GGUF lifecycle, modes, prompts, runtime metrics
- `lib/storage/` — SQLite database
- `lib/memory/` — bounded memory and project continuity
- `lib/voice/` + `hooks/` — visible voice/TTS
- `lib/tools/` — structured safe tool system
- `termux/` — authenticated localhost bridge
- `schemas/` — contracts
- `tests/` — deterministic logic tests
- `docs/` — architecture, install, security, acceptance
- `.claude/JARVIS_STATE.md` — continuity state for the coding agent

## Definition of done

Do not call the project done until the native build compiles and the physical-device tests in `docs/ACCEPTANCE_TESTS.md` have been executed and recorded.

## Build 0.3 — Free AI Hub

Build 0.3 adds an optional keyless online-model hub alongside the offline GGUF engine. It uses browser-side Puter.js inside a React Native WebView so JARVIS does not store provider developer API keys. The app discovers the live catalog, defaults to explicit `:free` variants, streams replies, and persists the online conversation locally.

The hub also includes official consumer-web launchers for ChatGPT, Gemini, and Grok. Those portals remain separate provider sessions; JARVIS does not scrape their consumer websites.

See `docs/ONLINE_MODELS.md` and `docs/BUILD_PROGRESS_0.3.0.md`.
