# JARVIS ROG — Build 0.3.0 Progress

## Milestone

Optional keyless online-model layer added while keeping the local GGUF path independent.

## Added

- `AI Hub` tab.
- Puter.js WebView gateway with explicit in-WebView sign-in.
- Dynamic live model discovery through Puter model metadata.
- Provider normalization for OpenAI/GPT, Google/Gemini, xAI/Grok, Anthropic/Claude, DeepSeek, Qwen, Mistral, Meta/Llama, OpenRouter and others.
- Free-only guard enabled by default.
- Persistent online conversation table in local SQLite.
- Online model search and provider filters.
- Streamed online model responses.
- Official consumer portal launchers for ChatGPT, Gemini and Grok.
- `react-native-webview` pinned to Expo SDK 54's documented compatible version.
- Unit coverage for model normalization/free filtering.

## Deliberately not implemented

- No scraping of ChatGPT/Gemini/Grok consumer pages.
- No browser-cookie theft.
- No hidden account-token extraction.
- No provider API keys embedded in the application.
- No claim that every hosted model is unlimited/free forever.
- No automatic online-model tool execution against Android or Termux.

## Remaining build gates

- Install dependencies with network access.
- `pnpm check`.
- `pnpm lint`.
- `pnpm test`.
- Expo Android clean prebuild.
- Gradle debug/release builds.
- Test Puter popup/auth behavior inside Android WebView on the ROG Phone 8 Pro.
- Test live `:free` catalog availability on-device.
- Test streaming and persistence on physical hardware.
