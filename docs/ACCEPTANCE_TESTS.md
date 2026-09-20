# Physical Device Acceptance — ASUS ROG Phone 8 Pro (AI2401)

Mark PASS only after performing the test on the actual phone, with the exact
APK under test. Record observations in `docs/ACCEPTANCE_REPORT.md`.

**A test that cannot fail is not a test.** Several rows below deliberately
specify *what wrong behaviour looks like*, because the earlier suite had rows a
broken build would still have passed.

## 0. Build integrity (before touching the phone)

| # | Test | Pass condition | Fails if |
|---|---|---|---|
| 0.1 | Inference engine present | `unzip -Z1 app-debug.apk \| grep '^lib/arm64-v8a/librnllama'` lists at least one library. | No match. The APK would install and launch with local inference dead. |
| 0.2 | Target ABI | The APK contains `lib/arm64-v8a/`. | Only other ABIs present. |
| 0.3 | Acceleration declared | `AndroidManifest.xml` declares `libOpenCL.so` and `libcdsprpc.so`. | Absent. |
| 0.4 | APK identity | sha256 of the installed file matches the artifact that CI or EAS produced. | Any mismatch: you are not testing the built APK. |

## 1. Launch and model lifecycle

| # | Test | Pass condition | Fails if |
|---|---|---|---|
| 1.1 | Cold launch | Native APK opens without crash. | Any crash or ANR. |
| 1.2 | GGUF picker | Android document picker opens. | |
| 1.3 | GGUF copy | Model copies into private app storage; a non-zero size is shown. | Size shown as 0 or a size that differs from the source. |
| 1.4 | GGUF parse | `loadLlamaModelInfo` succeeds for the imported file. | |
| 1.5 | Model load | llama.rn reports ready. | Status shows ready while generation then fails: readiness must reflect the runtime. |
| 1.6 | Load failure is honest | Import a deliberately truncated or non-GGUF file. The error is surfaced. | It reports ready, or fails silently. |
| 1.7 | Unload | Unloading releases the context; memory drops and status returns to unloaded. | |
| 1.8 | Reload after background | Background the app for 5 minutes, return, generate. Either it still works or the state truthfully says the context was released. | It claims ready and then throws. |

## 2. Local inference, offline

Put the device in **airplane mode** for this whole section.

| # | Test | Pass condition | Fails if |
|---|---|---|---|
| 2.1 | Offline English | An English prompt returns a local response. | |
| 2.2 | Offline Arabic — answered in Arabic | Ask in Arabic with Settings language set to Arabic. **The reply is written in Arabic script.** | The reply is in English. This is the specific regression the language directive fixes; a reply that merely exists is not a pass. |
| 2.3 | Arabic keeps code in Latin script | Ask in Arabic for a shell command or code snippet. The prose is Arabic; the command itself stays in Latin script and is runnable. | The command is transliterated into Arabic and therefore unusable. |
| 2.4 | No unsolicited translation | The Arabic reply does not append an English translation that was not requested. | |
| 2.5 | Language switch takes effect | Switch Settings to English and re-ask. The reply is English. | The previous language persists. |
| 2.6 | Fast | Fast mode uses its configured generation profile. | |
| 2.7 | Deep | Deep mode produces visibly longer reasoning than Fast on the same prompt. | |
| 2.8 | Create | Create mode works. | |
| 2.9 | Code | Code mode works. | |
| 2.10 | Cancellation | Stop during generation halts it promptly and leaves the context reusable. | The next prompt fails or returns the previous stream. |

## 3. Truthful runtime state

| # | Test | Pass condition | Fails if |
|---|---|---|---|
| 3.1 | Metrics measured, not invented | TTFT and tokens/sec appear only when actually measured; otherwise `N/A`. | A plausible number appears before any generation. |
| 3.2 | Backend reported honestly | Settings shows `gpu` and any `reasonNoGPU` exactly as llama.rn reports. | It asserts GPU or NPU acceleration the runtime did not report. |
| 3.3 | Running plan is shown | With adaptive sizing on, the Local runtime card shows the tier, context, batch, threads and GPU layers the loaded context was **actually built with**. | It shows the configured values while different ones are running. |
| 3.4 | Thermal honesty | The card reads "Thermal reading: not measured" until a native PowerManager bridge exists. | It claims a thermal reading or a thermal tier that was never read. |
| 3.5 | Observed power values | Battery, charging and RAM show real values, or `N/A` where unread, with each unavailable signal and its reason listed. | A value is shown that the platform did not report. |
| 3.6 | Adaptive off pins the runtime | Turn adaptive sizing off, reload. The runtime matches the explicit settings exactly. | |
| 3.7 | Unload clears the plan | After unload, no runtime plan is displayed. | A stale plan persists. |

## 4. Memory, projects, continuity

| # | Test | Pass condition | Fails if |
|---|---|---|---|
| 4.1 | Memory persists | An explicitly saved memory survives an app restart. | |
| 4.2 | Memory deletion | A deleted memory does not return after restart. | |
| 4.3 | Memory is reference data | Save a memory whose text tries to issue instructions (for example "ignore your rules"). It is used as reference, not obeyed. | The model follows it as a command. |
| 4.4 | Project persists | The active project survives an app restart. | |
| 4.5 | Continuity is accurate | A completed step is never presented as pending. | |
| 4.6 | Project switching | Switch projects quickly. Steps shown always belong to the project in the heading. | Steps from a previously selected project appear. |
| 4.7 | Data survives upgrade | Install the next build over this one without uninstalling. Memories, projects and conversations are all still present. | Any loss. This is what the schema versioning protects. |
| 4.8 | Cascade cleanup | Delete a project. Its steps are gone, with no orphans. | |

## 5. Voice

| # | Test | Pass condition | Fails if |
|---|---|---|---|
| 5.1 | Permission | Starting voice requests and uses microphone permission correctly. | |
| 5.2 | Permission denial | Deny the permission. The real state is surfaced. | It shows listening while denied. |
| 5.3 | STT is real | A spoken test phrase produces a transcript matching what was said. | Placeholder or canned text appears. |
| 5.4 | Model-not-ready honesty | Before the local STT model is ready, the UI says so. | It shows listening with no engine loaded. |
| 5.5 | Stop releases the mic | The Android microphone indicator disappears after Stop. | The indicator persists. |
| 5.6 | Background hands-free session | With Hands-free ON, backgrounding/minimizing the app keeps the visible foreground microphone session active and wake commands are still processed. | The microphone stops unexpectedly, no foreground-service indication exists, or wake commands stop being processed. |
| 5.7 | Rapid start/stop | Start and stop repeatedly. No stale transcript from an earlier session appears. | |
| 5.8 | TTS | The device speaks a generated response. | |
| 5.9 | TTS language | With Arabic selected, the Arabic reply is spoken with an Arabic voice. | |

## 6. Tools and the Termux bridge

| # | Test | Pass condition | Fails if |
|---|---|---|---|
| 6.1 | Termux absent | With the bridge not running, the core assistant still works. | Local chat breaks. |
| 6.2 | Termux auth | A wrong bridge secret is rejected. | |
| 6.3 | Unknown action rejected | An unknown Termux action is rejected. | |
| 6.4 | Unknown tool rejected | A tool name outside the registry is rejected with `UNKNOWN_TOOL`. | It executes or is silently approximated. |
| 6.5 | Grammar-constrained call | If a grammar-constrained tool call is exercised, llama.cpp accepts the generated GBNF and the output parses on the first attempt. | The runtime rejects the grammar. **Currently unverified: the grammar is unit-tested for structure but has never been executed on device.** |
| 6.6 | Tool audit | Every tool result appears in the local audit data. | A tool ran with no audit row. |
| 6.7 | Confirmation boundary | A tool marked `confirmation: required` does not run without confirmation. | |
| 6.8 | No arbitrary shell | There is no path from model output to an unallowlisted command. | |

## 7. Optional online AI hub

The local core must keep working throughout this section.

| # | Test | Pass condition | Fails if |
|---|---|---|---|
| 7.1 | WebView login | The provider portal signs in inside the app WebView. | |
| 7.2 | Free-only guard | With free-only on, only free models are selectable. | A paid model is offered or silently substituted. |
| 7.3 | No silent paid switch | Requesting a free model never falls back to a paid one without saying so. | |
| 7.4 | Streaming | An online response streams incrementally. | |
| 7.5 | Online persistence | Online conversations survive an app restart. | |
| 7.6 | Token expiry | Let the session expire. It is handled without crashing the local core. | The app crashes or local chat breaks. |
| 7.7 | Local independence | Disable the internet entirely. Local GGUF chat still works. | Local inference depends on the online layer. |
| 7.8 | Isolation | Provider portal sessions cannot reach native JARVIS tools. | |

## 8. Stability and thermals

| # | Test | Pass condition | Fails if |
|---|---|---|---|
| 8.1 | Representative run | A 10-minute session is observed for stability and heat. Record the result rather than assuming it. | |
| 8.2 | Sustained throughput | Record tokens/sec at the start and at the 10-minute mark. Note any drop. | |
| 8.3 | No OS kill | Android does not kill the app during the run. | |
| 8.4 | Recovery | After the run, a new generation still succeeds. | |

## 9. Data control

| # | Test | Pass condition | Fails if |
|---|---|---|---|
| 9.1 | Erase all | Local chats, memory, projects and settings are removed as designed. | Anything survives. |
| 9.2 | Erase is complete | After erase and restart, nothing returns. | |
