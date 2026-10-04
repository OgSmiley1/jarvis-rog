import { beforeEach, expect, it, vi } from 'vitest';
import { PermissionsAndroid } from 'react-native';
import { checkMicrophonePermission, getMicrophonePermission, requestMicrophonePermission } from '@/lib/voice/microphone';
beforeEach(async () => { vi.restoreAllMocks(); vi.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true); await checkMicrophonePermission(); });
it('uses observed granted permission without another request', async () => {
  const request = vi.spyOn(PermissionsAndroid, 'request');
  expect(await requestMicrophonePermission()).toBe('granted');
  expect(request).not.toHaveBeenCalled();
});
it('distinguishes permanently denied and does not repeat the dialog', async () => {
  vi.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
  const request = vi.spyOn(PermissionsAndroid, 'request').mockResolvedValue('never_ask_again');
  expect(await requestMicrophonePermission()).toBe('blocked');
  expect(await requestMicrophonePermission()).toBe('blocked');
  expect(request).toHaveBeenCalledOnce();
  expect(getMicrophonePermission()).toBe('blocked');
});
it('deduplicates concurrent requests and handles a later grant through Android settings', async () => {
  vi.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
  const request = vi.spyOn(PermissionsAndroid, 'request').mockResolvedValue('denied');
  const a = requestMicrophonePermission();
  const b = requestMicrophonePermission();
  expect(a).toBe(b);
  expect(await a).toBe('denied');
  expect(request).toHaveBeenCalledOnce();
  vi.mocked(PermissionsAndroid.check).mockResolvedValue(true);
  expect(await checkMicrophonePermission()).toBe('granted');
});
