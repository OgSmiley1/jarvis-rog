import type { NeuralBackend } from '@/lib/voice/neuralSpeaker';

export function useKokoroVoice(_enabled: boolean): { ready: boolean; progress: number; backend: NeuralBackend } {
  return {
    ready: false,
    progress: 0,
    backend: { synthesize: async () => new Float32Array(), play: async () => undefined },
  };
}
