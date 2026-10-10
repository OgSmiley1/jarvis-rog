# JARVIS 0.5.5 preview

This update develops the current JARVIS 0.5.4 stack in place. It keeps the
existing state machine, diagnostics, tool routing, DeepInfra fallback and
on-device model files, and adds an optional Ollama backend for the ASUS ROG
Phone 8 Pro.

Ollama uses its OpenAI-compatible endpoint at
`http://127.0.0.1:11434/v1/chat/completions`. It needs no API key. Local Only
allows this loopback endpoint while blocking remote and hosted providers. The
default model is `llama3.2:3b` for speed. `dolphin-llama3:8b` can be selected in
Settings after it is pulled if its response quality is preferred.

## Install the APK

```bash
pkg install -y python curl termux-tools && curl --fail --location --retry 3 https://raw.githubusercontent.com/OgSmiley1/jarvis-rog/apk-0.5.5-r1/install-on-termux.py -o "$HOME/jarvis-install-0.5.5.py" && python "$HOME/jarvis-install-0.5.5.py"
```

Keep the existing installation and model directory. The update is signed with
the same preview certificate as the previous local build.

## Start Ollama in Termux

From the repository's `termux` directory, or after downloading the script from
GitHub:

```bash
curl --fail --location https://raw.githubusercontent.com/OgSmiley1/jarvis-rog/main/termux/setup-ollama.sh -o "$HOME/setup-jarvis-ollama.sh" && bash "$HOME/setup-jarvis-ollama.sh"
```

The script enables a Termux wake lock, starts Ollama on loopback, waits for a
real `/api/tags` response, and pulls `llama3.2:3b`. For the slower 8B quality
model run `JARVIS_OLLAMA_MODEL=dolphin-llama3:8b bash "$HOME/setup-jarvis-ollama.sh"`.

In JARVIS Settings → Cloud brain, enable **Ollama local**, keep the endpoint at
`http://127.0.0.1:11434`, choose the pulled model, and use **Test cloud brain**.
Require a returned sentence before treating it as ready. Local model inference
remains the default unless Cloud first is explicitly enabled.
