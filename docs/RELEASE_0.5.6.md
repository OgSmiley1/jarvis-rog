# JARVIS 0.5.6 preview

Develops the existing app. Local GGUF inference remains the default; enable backend fallback for configured cloud providers or on-device Ollama. Cloud first can prioritize a configured hosted provider when Internet access is allowed. Under Local Only, the app now reaches Ollama on 127.0.0.1:11434 rather than disabling the backend path entirely.

Fast spoken backend replies are limited to 128 tokens, matching the embedded brain, to reduce time spent generating and speaking. The main screen keeps the animated Core, response and Talk/Interrupt controls; engineering details remain in Advanced settings. Removed a dead menu block. No essential voice or model libraries were removed without evidence that they cause lag.

Diagnostics now lists every registered tool, showing registry-only UNVERIFIED status until the handler is actually run, failed execution, or policy blocking. Successful handler returns show measured time and observation timestamp; they do not prove a phone action occurred or that response quality is correct. The feature evidence holds only one result per tool and no private payloads. No diagnostic test sends calls, texts or other intrusive actions automatically.

## Install in Termux

```bash
pkg install -y python curl termux-tools && curl --fail --location --retry 3 https://raw.githubusercontent.com/OgSmiley1/jarvis-rog/apk-0.5.6/install-on-termux.py -o "$HOME/jarvis-install-0.5.6.py" && python "$HOME/jarvis-install-0.5.6.py"
```

Update in place to preserve the existing brain and app data.

## Free local backend

```bash
curl --fail --location https://raw.githubusercontent.com/OgSmiley1/jarvis-rog/apk-0.5.6/setup-ollama.sh -o "$HOME/setup-jarvis-ollama.sh" && bash "$HOME/setup-jarvis-ollama.sh"
```

Enable Ollama local in Advanced settings, use http://127.0.0.1:11434 and llama3.2:3b, then Test cloud brain. Dolphin 8B is optional and usually slower. Hosted providers require your own configured accounts; free quotas and latency depend on the provider. No automatic purchase is made.

## Verification boundary

Build and automated tests are verified in the workspace. Physical phone installation, voice quality, audible speech and end-to-end response latency require device verification. No Android device is attached to this workspace. A passing handler test is not a blanket claim that all features work on the phone.
