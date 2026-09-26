# Fit for the ASUS ROG Phone 8 Pro

An audit of every layer of this project against the actual hardware, done by
reading the code rather than assuming. **Nothing here has been observed on the
device** — no APK from this branch has been installed yet. Each row says what
the source does, not what the phone did.

## The target

| | |
| --- | --- |
| Model | ASUS ROG Phone 8 Pro (AI2401) |
| SoC | Snapdragon 8 Gen 3 — 1 prime (X4) + 5 performance (A720) + 2 efficiency (A520) |
| GPU / NPU | Adreno 750, Hexagon DSP |
| RAM | 16 GB LPDDR5X |
| ABI | arm64-v8a, with `dotprod` and `i8mm` |
| Display | 6.78" 2400 × 1080 AMOLED, up to 165 Hz |
| Android | 16 / API 36 (per the recorded device baseline) |

## Already tuned for this phone

| Layer | What it does | Where |
| --- | --- | --- |
| APK architecture | Builds **arm64-v8a only** — the other ABIs are dead weight on this phone | `eas.json`, `gradleCommand` |
| SDK levels | `compileSdk`/`targetSdk` 36, `minSdk` 24 | `app.config.ts` |
| Inference engine | `enableOpenCLAndHexagon` — declares `libOpenCL.so` and `libcdsprpc.so`, so the Adreno and Hexagon paths are available to llama.rn | `app.config.ts` |
| Engine variant | The jniLibs fix pulls all seven arm64 variants including `librnllama_v8_2_dotprod_i8mm_hexagon_opencl.so` — the fastest path for a chip that has both `dotprod` and `i8mm` | `package.json` `onlyBuiltDependencies` |
| Thread count | Caps at **6**, not 8: scheduling llama.cpp across the two A520 efficiency cores fights the OS scheduler and raises skin temperature for very little throughput | `lib/inference/thermalPlan.ts` |
| Thermal adaptation | Five tiers driven by the real `PowerManager.getCurrentThermalStatus()`, bridged by a local Expo module | `modules/expo-thermal-status/` |
| Assistant role | Registers as a `VoiceInteractionService`, so long-press-home opens the orb over any app | `plugins/withJarvisAssistant.js` |
| Orb animation | `Animated` on the **native driver** only — runs on the render thread, so a 165 Hz panel costs the JS thread nothing while tokens stream | `components/JarvisOrb.tsx` |
| APK verification | Refuses an APK missing `lib/arm64-v8a/librnllama*.so` or the JS bundle — a green build that shipped no inference engine has happened before | `scripts/install-fixed-on-phone.sh` |

## Fixed in this pass

**16 GB of RAM bought nothing.** `planRuntime()` had a rule that *lowered* the
context below 8 GB and no rule that ever raised it. `overdrive`, the only tier
with an 8192 context, requires `coolerAttached`, and **nothing in the codebase
ever sets that field** — `lib/device/powerState.ts` reads thermal status,
battery and total RAM, and no AeroActive detection exists. So on this phone,
sitting cool with 16 GB free, JARVIS ran a 4096 context and never touched the
headroom.

Generous RAM now raises the context to 8192 while thermals are unthrottled.
Only the context: threads and GPU layers remain a heat decision and stay
governed by the thermal tier, while context is a memory decision. A throttling
phone is never handed a bigger working set. Five tests.

The practical effect is that JARVIS holds roughly twice as much of the
conversation, the active project and retrieved memory before it starts
forgetting the beginning.

## Known gaps, stated rather than hidden

- **AeroActive Cooler is not detected.** `coolerAttached` is in the model and
  nothing sets it, so the `overdrive` tier is unreachable. That is honest
  behaviour — an undetected cooler reads as `undefined`, never as confidence in
  headroom — but the tier is currently dead code. Detecting the cooler would
  need a USB/accessory probe that does not exist yet.
- **The recommended model is conservative.** Qwen3-4B Q4_K_M (~2.5 GB) is sized
  for a mid-range phone, not for 16 GB. A 7–8B at Q4 (~4.5–5 GB) would fit
  comfortably alongside an 8192 context and be noticeably more capable. Left
  alone deliberately: changing the default download is the owner's call, and
  the current one should be measured on the device first.
- **No APK from this branch has run.** Every row above is a reading of the
  source. `dl.google.com` is denied by the build environment's egress policy,
  so Gradle cannot run here and none of this has been compiled, let alone
  launched. See `.claude/JARVIS_STATE.md`.
- **165 Hz is not explicitly requested.** The app does not ask for a high
  refresh mode; it takes whatever the system gives it. The animations are
  native-driver and frame-rate independent, so this costs nothing — it simply
  is not tuned either way.
