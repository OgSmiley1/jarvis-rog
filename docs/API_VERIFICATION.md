# API Verification Notes — Build 0.2.0

These notes record the external APIs checked while hardening this build. They are not performance claims.

## Expo SDK 54

- Expo SDK 54 targets React Native 0.81 and React 19.1.
- `expo-file-system` SDK 54 supports the `File`, `Directory`, and `Paths` APIs used by JARVIS.
- For large asynchronous copies, SDK 54 still exposes `copyAsync` through `expo-file-system/legacy`; Build 0.2.0 uses that path so a multi-gigabyte GGUF copy is not performed synchronously on the JavaScript thread.

Official references:
- https://docs.expo.dev/versions/v54.0.0/
- https://docs.expo.dev/versions/v54.0.0/sdk/filesystem/

## llama.rn

The project relies on documented llama.rn APIs including:
- `loadLlamaModelInfo(modelPath)` for model metadata/validation.
- `initLlama(...)` for a local context.
- `context.completion(...)` for generation.
- `context.stopCompletion()` for cancellation.

Official repository:
- https://github.com/mybigday/llama.rn

## React Native ExecuTorch 0.9.x speech-to-text

The voice hook is intentionally written for the 0.9.x API range declared by the package manifest. It uses:
- `models.speech_to_text.whisper_tiny()`
- `models.vad.fsmn_vad()`
- `useSpeechToText({ model, vad })`
- `stream(...)`
- `streamInsert(Float32Array)`
- `streamStop()`

The 0.9.x streaming interface yields committed/non-committed transcription results and the code reads their `.text` values.

Official references:
- https://docs.swmansion.com/react-native-executorch/docs/0.9.x/api-reference/variables/models
- https://docs.swmansion.com/react-native-executorch/docs/hooks/natural-language-processing/useSpeechToText

## React Native Audio API

`AudioRecorder` is the microphone source. The Expo plugin is configured in this build with Android recording permission and `androidForegroundService: false`, matching the product rule that voice is a visible in-app session and not a persistent background microphone service.

Official references:
- https://docs.swmansion.com/react-native-audio-api/docs/fundamentals/getting-started/
- https://docs.swmansion.com/react-native-audio-api/docs/other/audio-api-plugin/
- https://docs.swmansion.com/react-native-audio-api/docs/inputs/audio-recorder/


## Build 0.3 online gateway verification

Verified against current official documentation on 2026-09-19 before implementation:

- Expo SDK 54 documents `react-native-webview` 13.15.0 as the recommended compatible version.
- Puter.js browser mode exposes `puter.ai.chat()`, `puter.ai.listModels()`, browser authentication, streaming responses, and model metadata.
- Puter model metadata documents explicit `:free` variants with provider-controlled quotas/rate limits.
- Puter browser authentication avoids developer API keys, but the user-pays model gives each user a free allowance and can require payment beyond it.

Therefore Build 0.3 defaults to explicit free variants and never claims every hosted model is unlimited free.
