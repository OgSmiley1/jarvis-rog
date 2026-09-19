# Online Models Hub — Build 0.3

JARVIS remains local-first. The Online Models Hub is an optional internet layer that does not replace the owner-imported GGUF runtime.

## Goals

- No OpenAI, Google, xAI, Anthropic, or other developer API key is stored in JARVIS.
- Use a browser-side Puter.js gateway inside a React Native WebView.
- The user explicitly connects their Puter account in the embedded browser UI.
- Pull the model catalog live with `puter.ai.listModels()` instead of hard-coding model names that may disappear.
- Default to `Free-only`, which displays only model IDs explicitly marked `:free` (or equivalent free metadata) by the live gateway.
- Provide official consumer-web launchers for ChatGPT, Gemini, and Grok as a fallback.
- Keep local GGUF chat usable with no internet and with no Puter account.

## Cost model: important

"No API key" does not mean every hosted model is guaranteed unlimited and free forever.

Puter uses a user-pays architecture. Accounts receive a free allowance. Some live model variants are explicitly marked `:free`, and those may have provider-controlled quotas or rate limits. If a user selects non-free models after turning off Free-only mode, their Puter account may be charged or asked to upgrade.

JARVIS therefore:

1. starts with Free-only ON;
2. labels explicit free variants;
3. does not silently fall back from a free model to a paid model;
4. keeps official free-web links separate from the unified gateway;
5. never asks the user to paste provider API keys.

## Architecture

```
JARVIS Android
   |
   +-- Local GGUF (offline, default local brain)
   |
   `-- Free AI Hub (optional internet)
          |
          +-- React Native WebView
          |      |
          |      `-- Puter.js browser SDK
          |             |
          |             +-- live model list
          |             +-- browser authentication
          |             `-- streamed chat
          |
          +-- Free-only model guard
          |
          `-- Official consumer portals
                 +-- ChatGPT
                 +-- Gemini
                 `-- Grok
```

## Security boundary

- The WebView is used because browser-mode Puter.js handles authentication without a developer API key.
- JARVIS does not persist a Puter auth token in SQLite, AsyncStorage, SecureStore, or source code.
- No password is requested or logged by native JARVIS code.
- Native-to-WebView commands are structured objects, not arbitrary JavaScript from model output.
- Online model replies do not get permission to invoke Android/Termux tools automatically.
- Tool execution remains behind JARVIS's existing structured tool policy.

## Hardware acceptance tests

1. Install the Android build.
2. Open AI Hub with Wi-Fi/mobile data enabled.
3. Confirm the gateway reports Ready.
4. Tap Connect inside the embedded gateway and complete Puter authorization.
5. Refresh models.
6. Confirm Free-only defaults to ON.
7. Confirm only explicit free variants appear when Free-only is ON.
8. Select a free variant and send a test prompt.
9. Confirm streaming text appears.
10. Kill/reopen the app and confirm saved online conversation persists locally.
11. Disable internet and confirm local GGUF Chat still works while AI Hub reports an online error.
12. Confirm no provider API key exists in app settings or source.
