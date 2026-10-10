# JARVIS 0.5.2 preview

This release includes the existing local brain, voice, Core, phone tools, Local
Only policy, diagnostics and optional integrations, together with the microphone,
state, cancellation and overlay repairs. Version code: **2026100801**; Android
package: `com.app.localjarviscoach`; ABI: `arm64-v8a`.

## Install from Termux

Use a current Termux installation. Paste:

```bash
pkg install -y python curl termux-tools && curl --fail --location --retry 3 https://raw.githubusercontent.com/OgSmiley1/jarvis-rog/apk-0.5.2/install-on-termux.py -o "$HOME/jarvis-install-0.5.2.py" && python "$HOME/jarvis-install-0.5.2.py" --bridge
```

This downloads the release manifest and APK, checks size/SHA-256 and embedded
version/source identity, then opens Android's installer. Approve the update and
allow installation from Termux if Android requests it. The optional `--bridge`
installs Python bridge dependencies and starts the bridge. Copy the bridge secret
printed in your Termux session into JARVIS's Advanced / Termux settings. Omit
`--bridge` if you do not need that integration. Install/open Termux:Boot separately
if you want the bridge to start after reboot.

The APK and evidence are stored under the immutable GitHub `apk-0.5.2` tag on
the distribution branch and linked from the release page. GitHub's release-asset
upload endpoint rejected the build environment's credentials; ordinary repository
pushes work. The `v0.5.2-preview` release tag identifies application source, while
`apk-0.5.2` identifies the distribution files.

The APK uses the preview Expo debug certificate. A differently signed installed
app cannot be updated with it. If Android reports a signing conflict, preserve
the installed app and obtain a build signed with its original key. Do not
uninstall or clear data to work around this.

To save the complete brain, vision, Whisper/VAD, English Kokoro and wake-word
model pack into `Download/JARVIS/models` before installation, run this instead:

```bash
pkg install -y python curl termux-tools && termux-setup-storage && curl --fail --location --retry 3 https://raw.githubusercontent.com/OgSmiley1/jarvis-rog/release/jarvis-0.5.2/scripts/setup-device-0.5.2.py -o "$HOME/jarvis-setup-0.5.2.py" && python "$HOME/jarvis-setup-0.5.2.py"
```

Allow shared-storage access, close JARVIS while files download, and press Enter
when prompted. It downloads about 3.83 GB of models plus the APK, checks upstream
model metadata, verifies every complete model file, then installs the APK and
optional Termux bridge. It resumes safely if interrupted. After installation,
grant JARVIS Android's All files access so it can load models from Downloads.

## Finish setup on the phone

1. Open JARVIS and keep Local Only off during initial downloads. Reuse an existing
   compatible brain; otherwise choose the recommended Qwen3 4B (~2.5 GB).
2. Allow model storage access when requested. Shared Download/JARVIS models and
   app-private models are reused during an in-place update.
3. Start Talk and allow Microphone. Let speech-recognition resources finish
   downloading on Wi-Fi. Microphone must appear in Android app permissions.
4. For optional English Kokoro speech, enable Human voice (neural) and wait for
   the separate ~351 MB download. Use Hear it to test audible output. Arabic uses
   the phone's speech engine; install its offline Arabic voice if needed.
5. Configure Floating Orb and Android overlay permission if desired. Check that
   it hides inside JARVIS and returns when JARVIS is backgrounded.
6. Test Talk, then interruption, before enabling Hands-free. Grant individual
   contacts/calendar/camera permissions when using those features. Optional cloud
   and live-provider integrations require their own configuration and network.
7. Enable Local Only and airplane mode. In Advanced / Diagnostics, run the local
   inference smoke test and then a real spoken request. Record the result.

An ordinary Termux installer cannot approve Android permissions or establish
working microphone capture by itself. The APK does not bundle multi-GB AI weights.
Downloads require available storage and network; a loaded model alone does not
prove a successful answer.

## Acceptance and scope

Release assets include `release-manifest.json`, `SHA256SUMS`, the binary manifest,
signature output and software-check logs. The manifest identifies the exact source
commit and APK hash. These are build checks; physical ROG phone acceptance remains
UNVERIFIED until the tests above are observed.

Push-to-interrupt is included. Full-duplex echo-cancelled interruption is not
implemented. Arbitrary cross-app typing/scrolling through Accessibility and the
Raspberry Pi satellite are not implemented. Registered tools and dispatched
Android intents do not prove every device action completed. A feature configured
in Settings is not automatically ready: permissions, downloaded resources and
actual runtime readiness still apply.
