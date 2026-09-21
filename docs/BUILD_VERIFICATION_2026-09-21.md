# Build verification — 2026-09-21

Baseline: PR #4, `feat/handsfree-jarvis-rog`, commit
`0f754a7dfc58af4c4968c5efcaf629b6064678a7`.

## Verified service evidence

- GitHub run `35579412048` reports `completed / failure`. Job `106268554787`
  exposes no executed steps; its log endpoint returns `404 BlobNotFound`.
  This does **not** establish a compiler error or an account/billing cause.
- The EAS status attached to that commit reports `error`. Its workflow belongs
  to `smiley007s-team/smiley`. The authenticated Expo session available during
  this check cannot access that account (`Account not found`).
- The accessible project `smileyjarviss-team/smiley` has ID
  `2311bd69-a9cc-448c-b45e-414532defa5d` and shows no builds. It is distinct from
  the configured project `eda56376-aa74-45d7-b652-68d661a9da9e`. Do not silently
  substitute project IDs or describe this empty history as the old build log.

## Confirmed fixes

- ExecuTorch 0.9.3 throws `ResourceFetcherAdapterNotInitialized` without an
  adapter. Register its official Expo adapter before mounting speech recognition.
- GitHub's previous `assembleDebug` artifact did not bundle JavaScript.
  Build `assembleRelease` for personal sideloading and require
  `assets/index.android.bundle` as well as the existing native llama checks.
- Use the frozen dependency lockfile in CI; retain the pinned Worklets 0.6.1.
- Remove the hands-free effect's incomplete dependency warning without changing
  the default hands-free setting or background recording behavior.

## Checks completed so far

- TypeScript: passed.
- Unit tests: 93 passed across 18 files.
- Lint: the existing hands-free effect warning was corrected; changed files pass.
- Smoke check: passed.
- Clean Android prebuild: passed.
- Production Android JavaScript/Hermes export: passed (4.65 MB bundle).
- Android llama.rn native archive: SHA-256 matches the package manifest;
  seven arm64 inference variants extracted.

APK compilation, artifact inspection, and physical ROG device acceptance are
separate gates. None of the checks above proves those gates have passed.
