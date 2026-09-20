const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const PKG = 'com.app.localjarviscoach';
const SERVICE = PKG + '.jarvis.JarvisVoiceInteractionService';
const SESSION = PKG + '.jarvis.JarvisVoiceInteractionSessionService';
const RECOGNITION = PKG + '.jarvis.JarvisRecognitionService';

function upsertService(services, next) {
  const name = next.$['android:name'];
  const index = services.findIndex((item) => item && item.$ && item.$['android:name'] === name);
  if (index >= 0) services[index] = next;
  else services.push(next);
}

function ensureActivityIntentFilter(activity, actionName) {
  activity['intent-filter'] = activity['intent-filter'] || [];
  const exists = activity['intent-filter'].some((filter) =>
    (filter.action || []).some((action) => action && action.$ && action.$['android:name'] === actionName)
  );
  if (exists) return;

  activity['intent-filter'].push({
    action: [{ $: { 'android:name': actionName } }],
    category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
  });
}

function withManifest(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const application = manifest.application && manifest.application[0];
    if (!application) throw new Error('JARVIS_ASSISTANT_APPLICATION_MISSING');
    application.service = application.service || [];

    const activities = application.activity || [];
    const mainActivity = activities.find((activity) =>
      (activity['intent-filter'] || []).some((filter) =>
        (filter.action || []).some((action) => action && action.$ && action.$['android:name'] === 'android.intent.action.MAIN')
      )
    );
    if (mainActivity) {
      ensureActivityIntentFilter(mainActivity, 'android.intent.action.ASSIST');
      ensureActivityIntentFilter(mainActivity, 'android.intent.action.VOICE_COMMAND');
    }

    upsertService(application.service, {
      $: {
        'android:name': SERVICE,
        'android:exported': 'true',
        'android:label': 'JARVIS ROG',
        'android:permission': 'android.permission.BIND_VOICE_INTERACTION',
      },
      'meta-data': [{ $: {
        'android:name': 'android.voice_interaction',
        'android:resource': '@xml/jarvis_voice_interaction_service',
      } }],
      'intent-filter': [{ action: [{ $: {
        'android:name': 'android.service.voice.VoiceInteractionService',
      } }] }],
    });

    upsertService(application.service, {
      $: {
        'android:name': SESSION,
        'android:exported': 'true',
        'android:permission': 'android.permission.BIND_VOICE_INTERACTION',
      },
    });

    upsertService(application.service, {
      $: {
        'android:name': RECOGNITION,
        'android:exported': 'true',
        'android:label': 'JARVIS ROG',
        'android:permission': 'android.permission.BIND_SPEECH_RECOGNITION_SERVICE',
      },
      'intent-filter': [{
        action: [{ $: { 'android:name': 'android.speech.RecognitionService' } }],
        category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
      }],
      'meta-data': [{ $: {
        'android:name': 'android.speech',
        'android:resource': '@xml/jarvis_recognition_service',
      } }],
    });

    return config;
  });
}

function withSources(config) {
  return withDangerousMod(config, ['android', async (config) => {
    const sourceRoot = path.join(config.modRequest.projectRoot, 'plugins', 'android-assistant');
    const javaRoot = path.join(
      config.modRequest.platformProjectRoot,
      'app', 'src', 'main', 'java', 'com', 'app', 'localjarviscoach', 'jarvis',
    );
    const xmlRoot = path.join(config.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');

    await fs.promises.mkdir(javaRoot, { recursive: true });
    await fs.promises.mkdir(xmlRoot, { recursive: true });

    const javaFiles = [
      'JarvisVoiceInteractionService.java',
      'JarvisVoiceInteractionSessionService.java',
      'JarvisVoiceInteractionSession.java',
      'JarvisRecognitionService.java',
    ];

    for (const file of javaFiles) {
      await fs.promises.copyFile(path.join(sourceRoot, file), path.join(javaRoot, file));
    }

    await fs.promises.copyFile(
      path.join(sourceRoot, 'jarvis_voice_interaction_service.xml'),
      path.join(xmlRoot, 'jarvis_voice_interaction_service.xml'),
    );
    await fs.promises.copyFile(
      path.join(sourceRoot, 'jarvis_recognition_service.xml'),
      path.join(xmlRoot, 'jarvis_recognition_service.xml'),
    );

    return config;
  }]);
}

module.exports = function withJarvisAssistant(config) {
  config = withManifest(config);
  config = withSources(config);
  return config;
};
