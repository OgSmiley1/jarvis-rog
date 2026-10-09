import { AppState, Linking, PermissionsAndroid, Platform } from 'react-native';
export type MicrophonePermission = 'unknown' | 'granted' | 'denied' | 'blocked' | 'unavailable';
let permission: MicrophonePermission = 'unknown';
let pending: Promise<MicrophonePermission> | null = null;
const listeners = new Set<() => void>();
export const getMicrophonePermission = () => permission;
export function subscribeMicrophone(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function publish(next: MicrophonePermission) { permission = next; for (const listener of listeners) listener(); return next; }
export async function checkMicrophonePermission(): Promise<MicrophonePermission> {
  if (Platform.OS !== 'android') return publish('unavailable');
  try {
    const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    return publish(granted ? 'granted' : permission === 'blocked' ? 'blocked' : 'denied');
  } catch { return publish('unavailable'); }
}
export function requestMicrophonePermission(): Promise<MicrophonePermission> {
  if (pending) return pending;
  const request = async () => {
    const status = await checkMicrophonePermission();
    if (status === 'granted' || status === 'blocked' || status === 'unavailable') return status;
    if (AppState.currentState !== 'active') return status;
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
      title: 'Speak to JARVIS', message: 'Allow microphone access to recognize your voice on this phone. You can stop listening at any time.',
      buttonPositive: 'Continue', buttonNegative: 'Not now',
    });
    return publish(result === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN ? 'blocked' : 'denied');
  };
  pending = request().finally(() => { pending = null; });
  return pending;
}
export async function openMicrophoneSettings() { await Linking.openSettings(); }
