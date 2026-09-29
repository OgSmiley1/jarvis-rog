/** Web and tests: no wake-word engine; the assistant listens for "Jarvis" in speech instead. */
export interface WakeWordEngine {
  process(frame: Float32Array): boolean;
  reset(): void;
}

export async function createWakeWordEngine(): Promise<WakeWordEngine | null> {
  return null;
}
