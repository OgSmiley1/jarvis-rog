# JARVIS 0.5.6 verification

Source commit: e9a49ad (main).

Verified in this workspace:

- TypeScript check and Expo lint passed.
- Vitest: 70 files, 627 tests passed.
- Python: 20 tests passed.
- Project smoke checks passed.
- New tests cover app backend eligibility under Local Only, spoken generation token limit, and every registered tool appearing in Diagnostics.

The release build, actual APK identity, permissions and signing evidence are supplied alongside this document. The release manifest is the checksum and source identity authority.

No physical Android device was connected to ADB during verification. Installation, audible TTS, microphone quality, Android action results and actual local/cloud response latency remain UNVERIFIED. Mock transport tests do not prove Ollama is running on the owner's phone or that a hosted account has quota.

Diagnostics executes a safe calculator request and a tiny local inference if a model is loaded. Every registered tool gets an individual row; unexecuted features are UNVERIFIED, policy-disabled features are BLOCKED, and observed handler failures are FAIL. PASS for a feature means its handler returned during this app session, with measured duration and timestamp; it does not certify an external Android action or response quality. No intrusive actions are fired automatically.

Fast spoken replies are capped at 128 tokens for embedded and configured backend inference. This bounds reply length; measured phone latency is still required before claiming a speed improvement.
