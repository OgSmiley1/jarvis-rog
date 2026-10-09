import { initExecutorch } from 'react-native-executorch';
import { ExpoResourceFetcher } from 'react-native-executorch-expo-resource-fetcher';

let initialized = false;

/**
 * Register the Expo resource fetcher once, immediately before the speech stack
 * is first used. Keeping this out of module-evaluation side effects makes the
 * app shell capable of starting even when the heavy voice runtime has a native
 * compatibility problem that still needs device diagnosis.
 */
export function ensureExecutorch(): void {
  if (initialized) return;
  initExecutorch({ resourceFetcher: ExpoResourceFetcher });
  initialized = true;
}
