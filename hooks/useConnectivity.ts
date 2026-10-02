import { useEffect, useState } from 'react';
import type { Connectivity } from '@/lib/voice/voiceSession';

/**
 * Online / offline / degraded, from Android's own network state — no request
 * is ever sent just to find out. `degraded` means connected but the OS says
 * the internet is not reachable (captive portal, dead Wi-Fi).
 */
export function connectivityFrom(state: { isConnected?: boolean | null; isInternetReachable?: boolean | null }): Connectivity {
  if (state.isConnected === false) return 'offline';
  if (state.isInternetReachable === false) return 'degraded';
  return 'online';
}

export function useConnectivity(): Connectivity {
  const [value, setValue] = useState<Connectivity>('online');
  useEffect(() => {
    let alive = true;
    let sub: { remove: () => void } | undefined;
    void import('expo-network')
      .then(async (Network) => {
        const state = await Network.getNetworkStateAsync();
        if (!alive) return;
        setValue(connectivityFrom(state));
        sub = Network.addNetworkStateListener((next) => alive && setValue(connectivityFrom(next)));
      })
      // No network module (older build): assume online and let requests say otherwise.
      .catch(() => undefined);
    return () => {
      alive = false;
      sub?.remove();
    };
  }, []);
  return value;
}
