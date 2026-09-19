import type { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'JARVIS ROG',
  slug: 'jarvis-rog',
  version: '0.3.0',
  orientation: 'portrait',
  scheme: 'jarvisrog',
  userInterfaceStyle: 'dark',
  newArchEnabled: true,
  android: {
    package: 'com.app.localjarviscoach',
    permissions: ['INTERNET', 'RECORD_AUDIO', 'POST_NOTIFICATIONS'],
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-sqlite',
    [
      'react-native-audio-api',
      {
        iosBackgroundMode: false,
        iosMicrophonePermission: 'JARVIS uses the microphone only during a visible voice session you start.',
        androidPermissions: ['android.permission.RECORD_AUDIO'],
        androidForegroundService: false,
        androidFSTypes: [],
      },
    ],
    [
      'llama.rn',
      {
        enableEntitlements: true,
        entitlementsProfile: 'production',
        forceCxx20: true,
        enableOpenCL: true,
      },
    ],
    [
      'expo-build-properties',
      {
        android: {
          compileSdkVersion: 36,
          targetSdkVersion: 36,
          minSdkVersion: 24,
          // Required for the authenticated localhost-only Termux bridge.
          usesCleartextTraffic: true,
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
});
