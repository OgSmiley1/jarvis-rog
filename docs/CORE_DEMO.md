# Five-step phone demo (ROG Phone 8 Pro)

Turn on **Settings → Live test link** first so every step is recorded (metadata only).

1. **Open JARVIS.** Only the Core on a black screen: red LED rings, teal arcs, a slow sweep. First launch shows the gesture card once — tap *Got it*. Long-press the Core → menu. Swipe in from the right edge (left in Arabic) → history.
2. **Local command.** Tap the Core and say *"what's the time"*, then *"set a timer for 2 minutes"*, then *"make a QR code for example.com"*. No brain involved; the QR shows in the menu.
3. **Ajman weather + Maghrib.** Say *"what's the weather in Ajman"*, then *"when is Maghrib"* (or *«متى أذان المغرب»*). Then *"say Ayat al-Kursi"* — the exact verse, with its source under it in the menu.
4. **Interrupt.** Ask something long (*"explain how a car engine works"*). While it talks, tap the Core: it contracts and stops within a moment; the rest of the answer never comes back.
5. **Airplane mode.** Turn it on. The small grey dot appears under the Core. Ask the time, a sum, a timer, and a question for the brain — all still answered. Ask the weather: you hear the last reading *with its age*, or an honest "I'm offline". Turn airplane mode off, ask again — one fresh answer, no duplicate.

Afterwards: long-press → the latency lines show median / p95 / n per scenario. Share the live log and run
`node scripts/measure-voice-latency.mjs log.txt` for the table. Under 30 runs per scenario is reported as "need 30", never as a result.
