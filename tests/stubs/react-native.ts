/**
 * Test-environment stand-in for the `react-native` entry point.
 *
 * `react-native/index.js` is Flow-typed (`import typeof ...`), which Vitest's
 * esbuild/Rollup pipeline cannot parse in a plain Node environment. These unit
 * tests exercise pure JARVIS logic (tool routing, schema validation, prompt
 * building); they never assert React Native behaviour. The stub therefore only
 * satisfies the import graph and records calls so a test can assert that a
 * platform call *would* have happened.
 *
 * This is a test-time alias only. It is never bundled into the app, so the
 * shipped APK always uses the real native modules.
 */

export const Platform = {
  OS: 'android' as const,
  Version: 36,
  select: <T,>(spec: { android?: T; ios?: T; native?: T; default?: T }): T | undefined =>
    spec.android ?? spec.native ?? spec.default,
};

export const Linking = {
  openURL: async (url: string): Promise<void> => {
    if (!/^https?:\/\//i.test(url)) throw new Error('INVALID_URL');
  },
  canOpenURL: async (): Promise<boolean> => true,
};

export const PermissionsAndroid = {
  PERMISSIONS: { RECORD_AUDIO: 'android.permission.RECORD_AUDIO' },
  RESULTS: { GRANTED: 'granted', DENIED: 'denied', NEVER_ASK_AGAIN: 'never_ask_again' },
  request: async (): Promise<string> => 'granted',
};

export const AppState = {
  currentState: 'active' as const,
  addEventListener: () => ({ remove: () => undefined }),
};

export const NativeModules: Record<string, unknown> = {};
export const DeviceEventEmitter = { addListener: () => ({ remove: () => undefined }) };
