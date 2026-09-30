# Current verification workflow

The cancellation and reasoning fixes are based on `feat/core-face-freeapis` at
`98b3b40`. Earlier build and acceptance entries describe earlier commits; they
are historical evidence, not acceptance of these changes.

## Install and verify

Use Node >= 20.19 and the package manager pinned in `package.json`:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm verify --report /tmp/jarvis-verification.json --android-export
```

Alternatively invoke the script directly (also works outside the repository):

```bash
node /path/to/jarvis-rog/scripts/verify-project.mjs --report /tmp/jarvis-verification.json --android-export
```

The script stops on a failed gate. It checks TypeScript, lint, all unit tests,
source smoke checks and the acceptance-report structure. `--android-export`
also builds the Android JS bundle. The JSON report records the commit, branch,
dirty status, runtime, gate results and timings. JS export does not compile the
native Android application.

`bash scripts/verify-voice.sh` runs the voice/cloud regression subset plus
TypeScript and lint. It covers pending-permission cancellation, cloud aborts
(including body reads), turn deadlines, provider failover and nested reasoning.

## Check an APK

After a native build, add `--apk /path/to/build.apk` to verification. With
`unzip` installed, this checks the arm64 inference and audio libraries, JS
bundle and manifest and records the APK SHA-256. The artifact's source commit
still needs confirming against its EAS/Gradle build record. Merely inspecting
an APK does not establish a successful native build of the current source or
prove that it is the artifact installed on the phone.

## Physical ROG acceptance remains pending

Build a new preview APK from the fixed commit and record its source commit,
build URL and SHA-256 in `docs/ACCEPTANCE_REPORT.md`. Install that exact APK,
then execute `docs/CORE_DEMO.md` and `docs/ACCEPTANCE_TESTS.md`.

For the fixes in this change, specifically test:

- Start listening, stop while a permission prompt is pending, then grant it:
  recording must remain stopped. Repeat for the notification prompt.
- Start a cloud question, tap Stop before the reply, then ask a new question:
  the old reply must not appear or speak, and cancellation must not trigger a
  local fallback.
- Check offline EN/AR, wake word, Bluetooth/headphones and background recording;
  measure latency, thermals, battery and a sustained 100-turn run.

Keep each unexecuted device row `NOT RUN`. Reports from this script deliberately
leave native compilation and physical-device testing `NOT RUN`.
