# JARVIS ROG — Phone setup

Do these steps once after installing the APK.

1. Open **JARVIS ROG**.
2. Allow **Microphone** and **Notifications** when Android asks.
3. Open **Settings** inside JARVIS.
4. Tap **Download free local brain**. Keep the app open until the download finishes and JARVIS shows the brain as ready.
5. In **Owner profile**, write any private preferences or personal context you want JARVIS to know. This stays in the app's local settings.
6. Keep **Hands-free JARVIS** ON and leave the wake word as **Jarvis** unless you want another word.
7. In Android: **Settings → Apps → Default apps → Digital assistant app → JARVIS ROG**.
8. In Android: **Settings → Apps → JARVIS ROG → Battery → Unrestricted** (wording can vary by Android/ROG firmware).
9. Optional but recommended for app-control tools: install **Termux** and **Termux:Boot** from F-Droid, place this repo's `termux` folder in Termux, then run:
   ```bash
   cd termux
   chmod +x install.sh start.sh stop.sh
   ./install.sh
   ```
   Copy the secret printed by the installer into **JARVIS → Settings → Termux bridge** and tap **Check bridge**. Open the Termux:Boot app once so Android registers its boot receiver.

Then test these exact commands:

- **Jarvis, open email**
- **Jarvis, show me the map of Dubai Mall**
- **Jarvis, open YouTube**
- **Jarvis, what do you remember about how I like you to reply?**

Important Android limitation: minimizing the app can keep an active microphone foreground service running. Force-stopping JARVIS stops it. Selecting JARVIS as the Android digital assistant gives the system an official assistant entry point, but it does not bypass Android's force-stop rules.
