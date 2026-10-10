# JARVIS 0.5.4 preview

This release keeps the 0.5.3 package, signing certificate and on-device model
files, while adding an OpenAI-compatible DeepInfra backend to the cloud
fallback. DeepInfra keys are stored in Android SecureStore and are never put in
the repository or APK. The provider is tried only when Cloud fallback is
enabled and Local Only is off. JARVIS never upgrades an account or spends
money automatically; DeepInfra promotional/free credits and rate limits are
account-dependent.

The local brain remains the primary answer path. With Cloud first disabled, a
loaded local model answers without sending the prompt away. With Cloud first
enabled, the configured free backend is tried first and the local model takes
over if the request fails.

## Install from Termux

```bash
pkg install -y python curl termux-tools && curl --fail --location --retry 3 https://raw.githubusercontent.com/OgSmiley1/jarvis-rog/apk-0.5.4/install-on-termux.py -o "$HOME/jarvis-install-0.5.4.py" && python "$HOME/jarvis-install-0.5.4.py"
```

Install in place. Do not uninstall JARVIS or clear its data; the existing
Qwen, speech, vision and wake-word files remain in `Download/JARVIS/models`.

## Configure DeepInfra

1. Open JARVIS → Settings → Advanced / Cloud brain.
2. Turn on cloud fallback, then optionally Cloud first.
3. Create a DeepInfra key, paste it into the DeepInfra row, and save it.
4. Leave Local Only off while testing the backend.
5. Tap Test cloud brain and require a real returned sentence before treating
   the provider as ready.

The final release manifest records the APK hash, package, version code and
source commit. Physical phone installation, microphone capture and model
latency remain device observations and are not inferred from a build.
