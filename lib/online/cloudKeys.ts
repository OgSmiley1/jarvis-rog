import * as SecureStore from 'expo-secure-store';
import { CLOUD_PROVIDERS, type CloudKeys, type CloudProviderId } from './cloudBrain';

/**
 * Cloud brain keys live in the Android keystore through expo-secure-store,
 * the same place the Termux bridge secret already lives. They are never
 * written to SQLite settings, never logged, and never shown back in full —
 * Settings only ever learns whether a key is present.
 */

const storageKey = (id: CloudProviderId) => `jarvis.cloud.${id}.key`;

export async function setCloudKey(id: CloudProviderId, key: string): Promise<void> {
  const clean = key.trim();
  if (!clean) throw new Error('CLOUD_KEY_EMPTY');
  await SecureStore.setItemAsync(storageKey(id), clean);
}

export async function clearCloudKey(id: CloudProviderId): Promise<void> {
  await SecureStore.deleteItemAsync(storageKey(id));
}

/** Every stored key. Only the cloud brain call path should hold these. */
export async function readCloudKeys(): Promise<CloudKeys> {
  const keys: CloudKeys = {};
  for (const provider of CLOUD_PROVIDERS) {
    const value = await SecureStore.getItemAsync(storageKey(provider.id));
    if (value?.trim()) keys[provider.id] = value.trim();
  }
  return keys;
}

/** Which providers have a key — safe to hand to the UI. */
export async function cloudProvidersWithKeys(): Promise<CloudProviderId[]> {
  const keys = await readCloudKeys();
  return CLOUD_PROVIDERS.filter((provider) => Boolean(keys[provider.id])).map((provider) => provider.id);
}
