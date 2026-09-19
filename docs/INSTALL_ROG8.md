# Install on ASUS ROG Phone 8 Pro

## Developer workstation

Requirements:

- Node 20.19+
- pnpm 10+
- Android Studio / Android SDK
- JDK compatible with the generated Expo/Gradle project
- USB debugging or Wireless debugging for development installation

## Build

```bash
corepack enable
pnpm install
npx expo install --fix
pnpm verify
npx expo prebuild --platform android --clean
cd android
./gradlew assembleDebug
```

Install the resulting debug APK using the normal Android development workflow.

## First launch

1. Open JARVIS ROG.
2. Open Settings.
3. Import a trusted `.gguf` model using Android's document picker.
4. Press Load model.
5. Confirm the runtime card reports `ready`.
6. Send a short English prompt.
7. Send a short Arabic prompt.
8. Turn on Airplane mode and repeat a local prompt.
9. Test visible voice input and verify the Android microphone indicator stops after Stop/background.

## Model sizing

Start smaller. A 2–4B multilingual Q4 model is a practical first physical-device test. Larger models may improve some reasoning tasks but increase load time, RAM pressure, battery use, and heat. Measure instead of assuming.

## Termux — optional

Install Termux from a source you trust, then copy `termux/` into Termux home and run:

```bash
chmod +x install.sh start.sh stop.sh
./install.sh
./start.sh
```

The installation prints a random shared secret. Enter that exact secret in JARVIS Settings. The bridge binds to `127.0.0.1:8765` only.

## Troubleshooting

### `MODEL_NOT_LOADED`
Import and load a GGUF first.

### GGUF load failure
Try a smaller trusted GGUF, confirm storage space, and capture the exact native error.

### No GPU acceleration
Do not fabricate a fix. Record `context.gpu`, `reasonNoGPU`, and device/build information. CPU fallback is still valid.

### Voice model not ready
Wait for the local speech resources to initialize/download according to the installed ExecuTorch implementation. Do not display a transcript until the model is actually ready.

### Termux bridge unavailable
Core JARVIS should keep working. Verify `./start.sh`, the secret, and loopback connectivity separately.
