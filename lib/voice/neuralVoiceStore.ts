/**
 * Shared status for the neural voice.
 *
 * The Kokoro model is ~351 MB of weights and must be loaded exactly once. It
 * lives in the HUD, which stays mounted underneath every sheet — including
 * Settings. Mounting the voice hook a second time in Settings would load a
 * second copy into memory, so Settings reads this store instead and asks the
 * HUD's instance to preview through it.
 *
 * Plain module state with a subscribe function, shaped for
 * React's useSyncExternalStore. Pure, so it is unit-tested.
 */

export interface NeuralVoiceStatus {
  /** The owner switched the neural voice on. */
  enabled: boolean;
  /** Weights downloaded and loaded; sentences go to Kokoro. */
  ready: boolean;
  /** 0..1 while downloading, as reported by the runtime. */
  progress: number;
  /** The runtime's own error text, if loading or synthesis failed. */
  error?: string;
  /**
   * Why the neural voice is not being used for the current language, when it
   * is not. Kokoro has no Arabic voice; that is stated, not hidden.
   */
  unavailableReason?: string;
}

type Listener = () => void;

const INITIAL: NeuralVoiceStatus = { enabled: false, ready: false, progress: 0 };

let status: NeuralVoiceStatus = INITIAL;
const listeners = new Set<Listener>();
let previewer: ((text: string) => Promise<void>) | undefined;

export function getNeuralVoiceStatus(): NeuralVoiceStatus {
  return status;
}

export function subscribeNeuralVoice(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setNeuralVoiceStatus(next: NeuralVoiceStatus): void {
  if (
    next.enabled === status.enabled &&
    next.ready === status.ready &&
    next.progress === status.progress &&
    next.error === status.error &&
    next.unavailableReason === status.unavailableReason
  ) {
    return;
  }
  status = next;
  for (const listener of listeners) listener();
}

/** The HUD registers its live instance so Settings can preview through it. */
export function registerNeuralPreviewer(speak: ((text: string) => Promise<void>) | undefined): void {
  previewer = speak;
}

/** Speak a sample through the loaded voice. False when no voice is loaded. */
export async function previewNeuralVoice(text: string): Promise<boolean> {
  if (!previewer || !status.ready) return false;
  await previewer(text);
  return true;
}

/** Test-only reset. */
export function resetNeuralVoiceStoreForTests(): void {
  status = INITIAL;
  listeners.clear();
  previewer = undefined;
}
