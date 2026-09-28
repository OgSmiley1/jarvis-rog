---
name: proof-first-release
description: Apply on every substantive code/design change, build, handoff and release. Root-cause debugging and evidence-based gates; no fake green checks.
---
# Proof-first Release
1. Define outcome in user-observable terms and map it to source files, automated tests and a real acceptance scenario. Separate implemented, tested locally, built, deployed and owner/device verified.
2. Before modifying code, reproduce defects and inspect existing tests. Fix root causes, not symptom screenshots or broad rewrites; add a targeted regression test for each recurring failure.
3. Use type-check, lint, unit/integration and smoke tests appropriate to the repo, plus browser screenshots for websites or hardware tests for Android. Record exact commands, environment, counts and failures. Never invent successful runs.
4. A passing build is not evidence that the real feature works. Validate actual assets, user interactions and any native libraries or model inference. Capture reproducible logs/screenshots and list skipped checks explicitly.
5. Maintain rollback and verified last-good commit. Use a feature branch and draft pull request. No production deployment, public access changes, infrastructure deletion, paid service or credential changes without explicit owner approval.
6. Complete human-facing QA independently from engineering QA; verify the exact built/deployed commit and correct service, not merely the deployment dashboard success state.
7. Keep costs low: prefer connected tools/free local checks; do not silently initiate billed services or duplicate cloud builds. If blocked, state the exact blocker and the next actionable owner step rather than guessing.
