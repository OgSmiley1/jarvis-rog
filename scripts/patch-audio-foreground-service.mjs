import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const base = resolve('node_modules/react-native-audio-api/android/src/main/java/com/swmansion/audioapi/system');
function patch(name, edits, marker) {
  const path = resolve(base, name);
  let source = readFileSync(path, 'utf8');
  if (source.includes(marker)) return;
  for (const [before, after] of edits) {
    if (!source.includes(before)) throw new Error(`Audio API 0.9.3 foreground patch no longer matches ${name}`);
    source = source.replace(before, after);
  }
  writeFileSync(path, source);
}
patch('MediaSessionManager.kt', [
  ['  fun startForegroundServiceIfNecessary() {', `  // JARVIS: microphone and playback have different Android 14+ prerequisites.
  fun activeForegroundTypes(): Int {
    var types = 0
    if (nativeAudioRecorders.isNotEmpty()) types = types or android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
    if (nativeAudioPlayers.isNotEmpty()) types = types or android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
    return if (types == 0) android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK else types
  }

  fun startForegroundServiceIfNecessary() {`],
  ['if (isServiceRunning || reactContext.get() == null)', 'if (reactContext.get() == null)'],
  ['      stopForegroundService()\n    }\n  }', '      stopForegroundService()\n    } else {\n      startForegroundService()\n    }\n  }'],
], 'fun activeForegroundTypes()');
patch('MediaNotificationManager.kt', [
  ['        if (!isServiceStarted) {', '        run { // JARVIS: refresh types as capture/playback ownership changes.'],
  ['ServiceInfo.FOREGROUND_SERVICE_TYPE_MANIFEST,', 'MediaSessionManager.activeForegroundTypes(),'],
], 'MediaSessionManager.activeForegroundTypes(),');
console.log('[JARVIS] Audio foreground service requests only active capture/playback types.');
