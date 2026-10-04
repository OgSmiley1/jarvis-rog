import { URL } from 'node:url';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const { repairVoiceManifest } = require('../plugins/withJarvisVoiceManifest.js');
it('repairs the actual merge-removal defect and is idempotent across repeated prebuilds', () => {
  const name = 'com.swmansion.audioapi.system.MediaNotificationManager$AudioForegroundService';
  const manifest = { 'uses-permission': [{ $: { 'android:name': 'android.permission.RECORD_AUDIO', 'tools:node': 'remove', 'android:maxSdkVersion': '28' } }], application: [{ service: Array.from({ length: 8 }, () => ({ $: { 'android:name': name } })) }] };
  repairVoiceManifest(manifest);
  const expected = JSON.stringify(manifest);
  repairVoiceManifest(manifest);
  expect(JSON.stringify(manifest)).toBe(expected);
  expect(manifest['uses-permission'].find(p => p.$['android:name'] === 'android.permission.RECORD_AUDIO')?.$).toEqual({ 'android:name': 'android.permission.RECORD_AUDIO' });
  expect(manifest.application[0]!.service).toHaveLength(1);
  expect(manifest.application[0]!.service[0]!.$).toMatchObject({ 'android:foregroundServiceType': 'microphone|mediaPlayback', 'android:exported': 'false' });
});
it('does not globally block voice permission through image picker configuration', () => {
  const config = readFileSync(new URL('../app.config.ts', import.meta.url), 'utf8');
  const imagePicker = config.split("'expo-image-picker'")[1]!.split('],')[0]!;
  expect(imagePicker).not.toContain('microphonePermission: false');
});
it('release gate inspects binary APK permissions and service count', () => {
  const gate = readFileSync(new URL('../scripts/record-release.py', import.meta.url), 'utf8');
  expect(gate).toContain("'dump', 'permissions'");
  expect(gate).toContain('android.permission.RECORD_AUDIO');
  expect(gate).toContain('Expected exactly one microphone foreground service');
});
