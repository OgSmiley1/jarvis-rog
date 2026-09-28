---
name: android-reality-check
description: JARVIS ROG Android APK delivery and physical acceptance; prevents false 'build success' and feature rewrites. Use for any JARVIS changes.
---
# JARVIS Android Reality Check
Read .claude/JARVIS_STATE.md completely and inspect latest main commit, PRs and actual EAS/GitHub build statuses. Some sections of the state file are historical; reconcile with newer repo/CI evidence. This project is OgSmiley1/jarvis-rog, Expo @smiley007s-team/smiley, com.app.localjarviscoach, Android for ASUS ROG Phone 8 Pro.
- Do not restart or substitute reconstructed old source. Preserve implemented native GGUF/llama.rn, 16kHz audio/Whisper path, SQLite migration and user data, Arabic/English prompts, thermal bridge, structured allowlisted tool router, Termux authentication and free-only optional online hub.
- Start by determining if latest EAS Android preview actually produced an APK. GitHub Actions runner-allocation problems are distinct from source failures; EAS workflow_dispatch {} and duplicate build changes are already documented. Inspect up-to-date logs instead of rewriting workflows by assumption.
- Run actual pnpm check, lint, test, smoke and native prebuild, then APK packaging assertions including lib/arm64-v8a/librnllama*.so. A green Gradle/EAS page is not proof local inference is included.
- Core acceptance requires installing the exact APK on owner's physical ROG Phone and observing real offline GGUF English/Arabic inference, measured diagnostics, voice input/output and stop cleanup, memory restart, bounded tools, permission flow, thermal readings, online free-only fallback independence. Mark device-only checks NOT VERIFIED until real readings/logs exist.
- Any unsupported Android functionality, native hardware capability or optional Shizuku/assistant/wakeword features stays clearly marked experimental and must not block the core APK. Never fake GPU/NPU metrics, transcription, model responses or hardware status.
- Keep core local-first with no required paid API, no silent paid models, no arbitrary shell or hidden mic. Protect local transcripts and secrets; don't publish sensitive data in public repos/tests.
- Release through a reviewable branch, not blind main edits. Document exact EAS run, APK hash, test evidence, remaining device gate and next action.
