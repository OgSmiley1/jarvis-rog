import type { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'JARVIS ROG',
  slug: 'smiley',
  owner: 'smiley007s-team',
  version: '0.4.0',
  orientation: 'portrait',
  scheme: 'jarvisrog',
  userInterfaceStyle: 'dark',
  newArchEnabled: true,
  android: {
    package: 'com.app.localjarviscoach',
    permissions: [
      'INTERNET',
      'RECORD_AUDIO',
      'POST_NOTIFICATIONS',
      'FOREGROUND_SERVICE',
      'FOREGROUND_SERVICE_MICROPHONE',
      'WAKE_LOCK',
    ],
  },
  plugins: [
    'expo-router',
    'expo-system-ui',
    'expo-secure-store',
    'expo-sqlite',
    [
      'react-native-audio-api',
      {
        iosBackgroundMode: false,
        iosMicrophonePermission: 'JARVIS uses the microphone only during a visible voice session you start.',
        androidPermissions: [
          'android.permission.RECORD_AUDIO',
          'android.permission.FOREGROUND_SERVICE',
          'android.permission.FOREGROUND_SERVICE_MICROPHONE',
        ],
        androidForegroundService: true,
        androidFSTypes: ['microphone'],
      },
    ],
    [
      'llama.rn',
      {
        enableEntitlements: true,
        entitlementsProfile: 'production',
        forceCxx20: true,
        enableOpenCLAndHexagon: true,
      },
    ],
    [
      'expo-build-properties',
      {
        android: {
          compileSdkVersion: 36,
          targetSdkVersion: 36,
          minSdkVersion: 24,
          usesCleartextTraffic: true,
        },
      },
    ],
  ],
  extra: {
    ...(config.extra ?? {}),
    eas: {
      projectId: 'eda56376-aa74-45d7-b652-68d661a9da9e',
    },
  },
  experiments: {
    typedRoutes: true,
  },
});
