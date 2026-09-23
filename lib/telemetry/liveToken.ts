import * as SecureStore from 'expo-secure-store';

/**
 * The live link's GitHub token, kept in the Android keystore like the cloud
 * keys. It should be a fine-grained token limited to the one private channel
 * repository, so even a leaked copy can touch nothing else.
 */

const STORAGE_KEY = 'jarvis.live.github.token';

export async function setLiveToken(token: string): Promise<void> {
  const clean = token.trim();
  if (!clean) throw new Error('LIVE_TOKEN_EMPTY');
  await SecureStore.setItemAsync(STORAGE_KEY, clean);
}

export async function readLiveToken(): Promise<string | null> {
  return SecureStore.getItemAsync(STORAGE_KEY);
}

export async function clearLiveToken(): Promise<void> {
  await SecureStore.deleteItemAsync(STORAGE_KEY);
}

export const DEFAULT_LIVE_CHANNEL: { owner: string; repo: string; number?: number } = {
  owner: 'OgSmiley1',
  repo: 'jarvis-live-tests',
};
