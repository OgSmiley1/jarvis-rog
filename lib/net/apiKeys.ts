import * as SecureStore from 'expo-secure-store';

/**
 * Free-API keys (today only The Guardian's) in the Android keystore, like the
 * cloud-brain keys. Never in settings, never logged, never shown back in full.
 */

export type FreeApiKeyId = 'guardian';

const storageKey = (id: FreeApiKeyId) => `jarvis.freeapi.${id}.key`;

export async function setFreeApiKey(id: FreeApiKeyId, key: string): Promise<void> {
  const clean = key.trim();
  if (!/^[A-Za-z0-9-]{8,80}$/.test(clean)) throw new Error('FREE_API_KEY_INVALID');
  await SecureStore.setItemAsync(storageKey(id), clean);
}

export async function clearFreeApiKey(id: FreeApiKeyId): Promise<void> {
  await SecureStore.deleteItemAsync(storageKey(id));
}

export async function readFreeApiKey(id: FreeApiKeyId): Promise<string | null> {
  try {
    const value = await SecureStore.getItemAsync(storageKey(id));
    return value?.trim() || null;
  } catch {
    return null;
  }
}

export async function hasFreeApiKey(id: FreeApiKeyId): Promise<boolean> {
  return (await readFreeApiKey(id)) !== null;
}
