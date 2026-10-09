const { withAndroidManifest } = require('expo/config-plugins');
const SERVICE = 'com.swmansion.audioapi.system.MediaNotificationManager$AudioForegroundService';
const PERMISSIONS = ['android.permission.RECORD_AUDIO', 'android.permission.FOREGROUND_SERVICE', 'android.permission.FOREGROUND_SERVICE_MICROPHONE', 'android.permission.POST_NOTIFICATIONS', 'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK'];
function repairVoiceManifest(manifest) {
  manifest['uses-permission'] ??= [];
  for (const name of PERMISSIONS) {
    manifest['uses-permission'] = manifest['uses-permission'].filter(item => item.$?.['android:name'] !== name);
    manifest['uses-permission'].push({ $: { 'android:name': name } });
  }
  const application = manifest.application?.[0];
  if (!application) throw new Error('Android application manifest missing');
  application.service = (application.service ?? []).filter(item => item.$?.['android:name'] !== SERVICE);
  application.service.push({ $: { 'android:name': SERVICE, 'android:exported': 'false', 'android:stopWithTask': 'true', 'android:foregroundServiceType': 'microphone|mediaPlayback' } });
  return manifest;
}
module.exports = config => withAndroidManifest(config, mod => { repairVoiceManifest(mod.modResults.manifest); return mod; });
module.exports.repairVoiceManifest = repairVoiceManifest;
