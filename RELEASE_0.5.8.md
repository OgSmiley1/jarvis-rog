# JARVIS 0.5.8 preview

This clean-install update enables the free loopback Ollama backend by default at `http://127.0.0.1:11434`. The owner's ROG Phone already has `llama3.2:3b` installed and a working Termux bridge, so a fresh JARVIS installation can answer through that local backend without re-downloading the model or entering cloud keys.

It includes the 0.5.7 diagnostic improvements: System Diagnostics performs a real tiny Ollama generation and reports its measured total time independently from the optional embedded GGUF. Hosted providers remain opt-in through their own keys and Local Only blocks them.

Install through Termux:

```bash
pkg install -y python curl termux-tools && curl --fail --location --retry 3 https://raw.githubusercontent.com/OgSmiley1/jarvis-rog/apk-0.5.8/install-on-termux.py -o "$PREFIX/tmp/jarvis-install.py" && python "$PREFIX/tmp/jarvis-install.py"
```

Android requires one Install/Update confirmation. The existing Ollama model and Termux files are not downloaded again. App-private settings cannot survive uninstall; the authenticated Termux bridge secret must be pasted once after a full uninstall.
