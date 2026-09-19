# JARVIS ROG Build 0.2.0 — Progress Report

## Scope completed in this sprint

Build 0.2.0 converts the initial production pack into a more coherent Android build candidate. The changes target runtime correctness rather than visual polish.

### Local model path
- GGUF document selection remains owner initiated.
- Large GGUF copies now use asynchronous file copying rather than a synchronous multi-gigabyte copy on the JavaScript thread.
- Available storage is checked before the private model copy.
- Destination size is compared with the selected source size.
- On Android, `loadLlamaModelInfo` validation runs before the imported model becomes the selected model.
- Failed validation removes the rejected private copy.

### Voice path
- Microphone remains explicitly owner started.
- The audio plugin is configured without a background foreground-service microphone mode.
- Recorder, transcription stream, and session identities are tracked separately.
- Start returns after the recorder successfully starts rather than remaining tied to the entire async transcription generator.
- Stop/background/unmount terminate the live stream and recorder.
- Stale stream updates from a prior session cannot overwrite a newer voice session.
- Coach shows local STT preparation progress and disables Start until the local speech pipeline reports ready.

### Continuity path
- Project steps now have active lifecycle controls: pending/running/success/failed/retry.
- Project `lastCompletedStep` and `nextAction` are derived from stored step state and persisted to SQLite.
- Projects can be activated, paused, completed, or deleted.
- Activating a project pauses another active project so continuity remains unambiguous.

### Chat and workspace routing
- `/analyse`, `/draft`, and `/plan` now open Understand with the supplied source text and requested mode.
- `/project` opens Projects.
- `/memory` opens Memory.
- `/status` opens Settings diagnostics.
- First user message automatically produces a local conversation title.
- Current conversations can be deleted locally.

### Diagnostics
- Startup initialization failures are surfaced with retry without erasing local data.
- Settings exposes model/runtime state, recent tool audit entries and Termux bridge status.
- Termux status checks still travel through the allowlisted audited tool path.

## Verification completed here

- TS/TSX parser: PASS, 53 files, zero syntax diagnostics.
- Pure TypeScript runtime assertions: PASS.
- Python Termux files: `py_compile` PASS.
- Shell files: `bash -n` PASS.
- JSON files: parse PASS.
- Source presence smoke test: PASS.

## Gates not claimed

This environment cannot access the npm registry, so dependency installation, full TypeScript type resolution, lint, Vitest, Expo prebuild and Gradle compilation are not claimed. Physical ROG Phone microphone/model/thermal testing is also not claimed.

## Next gate

Run the dependency and Android build commands documented in `.claude/JARVIS_STATE.md`, then install the APK on the ROG Phone 8 Pro and execute the physical acceptance checklist.
