# JARVIS 0.5.3 preview

This hotfix updates 0.5.2 in place. It keeps the package ID and signing
certificate, increases the Android version code to `2026101001`, and leaves
the existing Qwen, speech, vision and wake-word files in `Download/JARVIS/models`.
No multi-gigabyte model download is needed for an ordinary update.

The owner's 0.5.2 screenshots confirmed the Qwen3 4B model file and local
Termux bridge were present, but did not show a successful measured inference
turn. The app incorrectly classified every Termux tool as an Internet route,
then blocked the bridge's loopback request in Local Only mode. The fix allows
only the authenticated bridge's exact `http://127.0.0.1:8765/` route. Live
providers and other outbound traffic remain blocked by Local Only.

When hands-free wake detection was enabled, a Core tap marked the turn as
direct but still withheld audio frames from Whisper until the wake engine
detected the phrase. The fix opens speech recognition immediately on that tap.
Recent tool runs now show their time so older failures can be identified.

## Install on the phone

From Termux:

```bash
pkg install -y python curl termux-tools && curl --fail --location --retry 3 https://raw.githubusercontent.com/OgSmiley1/jarvis-rog/apk-0.5.3/install-on-termux.py -o "$HOME/jarvis-install-0.5.3.py" && python "$HOME/jarvis-install-0.5.3.py"
```

The installer checks the 0.5.3 manifest, APK checksum and embedded source
commit, then opens Android's update prompt. Approve the update. Do not remove
the existing JARVIS installation; in-place updates preserve app settings and
models. The APK uses the same Expo preview certificate as 0.5.2. If Android
reports a signature mismatch, stop rather than clearing app data.

## Check the actual runtime

1. In JARVIS Settings, confirm the existing Termux bridge still responds.
2. Turn Local Only on and invoke `termux.system_status`; it should return local
   status, and Recent tool runs should include the time of this new run.
3. With hands-free enabled, tap the Core and speak a short request. A transcript
   and reply should appear without saying the wake phrase first.
4. Run the Diagnostics self-test. Look specifically at Local inference,
   Microphone capture and Speech transcription. A loaded model file or a
   listening label alone does not verify those three operations.

Physical ROG phone results remain UNVERIFIED in the build workspace. Share the
new diagnostic result if a step still fails; it identifies the next failing
subsystem without requiring another model download.
