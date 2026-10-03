/** Live observations from the mounted HUD; absence remains UNVERIFIED. */
export const runtimeObservations: {
  coreState?: string; rendererMounted?: boolean; rendererError?: boolean;
  sttReady?: boolean; sttState?: string; speechPlaying?: boolean;
} = {};
