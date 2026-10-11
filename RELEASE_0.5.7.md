# JARVIS 0.5.7 preview

This update responds to the 0.5.6 device screenshots. The Termux bridge and Ollama model were confirmed on the owner's ROG Phone, while the separate Qwen GGUF failed native metadata parsing.

Diagnostics now sends a tiny real request to enabled loopback Ollama and reports **Ollama inference** independently with total response time. Hosted providers remain skipped during self-test, so Diagnostics does not leak prompts or consume account quota. The status header describes the GGUF as the embedded brain and identifies Ollama as configured instead of presenting one GGUF failure as a total brain failure.

Feature rows remain evidence-based: registry-only features are UNVERIFIED, Local Only restrictions are BLOCKED, failed handlers are FAIL, and handlers that returned during this session are PASS with measured duration. No calls, messages or other intrusive Android actions run automatically.

Install through Termux:

```bash
pkg install -y python curl termux-tools && curl --fail --location --retry 3 https://raw.githubusercontent.com/OgSmiley1/jarvis-rog/apk-0.5.7/install-on-termux.py -o "$PREFIX/tmp/jarvis-install-0.5.7.py" && python "$PREFIX/tmp/jarvis-install-0.5.7.py"
```

The existing Ollama model, bridge secret and app data are reused by an in-place update. Run **Test cloud brain**, then **System Diagnostics → Run Self-Test**. Physical microphone quality and Android action outcomes still require interactive confirmation.
