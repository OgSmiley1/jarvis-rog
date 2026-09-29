/** Web and tests: no wake-word engine; the loop uses the spoken "Jarvis" fallback. */
export interface WakeWordEngine {
  process(pcm: Int16Array): { detected: boolean; probability: number };
  reset(): void;
}

export async function createWakeWordEngine(): Promise<WakeWordEngine | null> {
  return null;
}
