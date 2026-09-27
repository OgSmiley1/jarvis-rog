import type { NeuralVoiceController, UseNeuralVoiceOptions } from './useNeuralVoice.native';

/** The on-device neural voice is Android-only; the web preview uses none. */
export function useNeuralVoice(_options: UseNeuralVoiceOptions): NeuralVoiceController {
  return {
    isReady: false,
    enqueue: () => undefined,
    speakAll: () => undefined,
    stop: () => undefined,
  };
}
