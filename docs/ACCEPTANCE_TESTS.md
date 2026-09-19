# Physical Device Acceptance — ROG Phone 8 Pro

Mark PASS only after performing the test on the actual phone.

| # | Test | Pass condition |
|---|---|---|
| 1 | Launch | Native APK opens without crash. |
| 2 | GGUF picker | Android picker opens. |
| 3 | GGUF copy | Selected model copies into private app storage and non-zero size is shown. |
| 4 | GGUF parse | `loadLlamaModelInfo` succeeds for the imported file. |
| 5 | Model load | llama.rn reports ready; failure is surfaced if not. |
| 6 | Offline English | Airplane mode prompt returns local response. |
| 7 | Offline Arabic | Airplane mode Arabic prompt returns local response. |
| 8 | Fast | Fast mode uses its configured generation profile. |
| 9 | Deep | Deep mode uses its configured generation profile. |
| 10 | Create | Create mode works. |
| 11 | Code | Code mode works. |
| 12 | Metrics | TTFT/tokens-per-second shown only when actually measured. |
| 13 | Memory | Explicitly saved memory survives app restart. |
| 14 | Delete memory | Deleted memory does not return. |
| 15 | Project | Active project survives app restart. |
| 16 | Continuity | Completed step is not presented as pending. |
| 17 | Voice permission | Start voice requests/uses microphone permission correctly. |
| 18 | Voice stop | Android mic indicator disappears after Stop/background. |
| 19 | STT | Spoken test phrase produces real local transcript. |
| 20 | TTS | Device speaks a generated response. |
| 21 | Termux absent | Core assistant still works with bridge absent. |
| 22 | Termux auth | Wrong bridge secret is rejected. |
| 23 | Unknown action | Unknown Termux action is rejected. |
| 24 | Tool audit | Tool result appears in local audit data. |
| 25 | Erase all | Local chats/memory/projects/settings are removed as designed. |
| 26 | Thermal run | 10-minute representative session is observed for stability/heat; result recorded rather than assumed. |
