import type { SpeakCallbacks, Speaker } from './speechQueue';

/**
 * A neural voice (Kokoro) as a queue speaker. Synthesis of a sentence starts
 * the moment it is handed over — while the previous one is still playing —
 * and playback is chained so sentences never overlap. With the SpeechQueue's
 * window of 2, sentence N+1 is being synthesised while N plays: no gap.
 *
 * A sentence the model cannot synthesise is spoken by the fallback (the
 * phone's own voice) rather than skipped. stop() silences the current audio
 * and abandons everything queued. Synthesis and playback are injected, so
 * this is tested without a phone.
 */

export interface NeuralBackend {
  synthesize(text: string): Promise<Float32Array>;
  /** Plays samples; resolves when they finish. Returns a stop handle via onPlaying. */
  play(samples: Float32Array, onPlaying: (stop: () => void) => void): Promise<void>;
}

export function neuralSpeaker(backend: NeuralBackend, fallback: Speaker): Speaker {
  let tail: Promise<void> = Promise.resolve();
  let epoch = 0;
  let stopCurrent: (() => void) | null = null;

  return {
    speak(text: string, callbacks: SpeakCallbacks) {
      const mine = epoch;
      const audio = backend.synthesize(text).catch(() => null);
      tail = tail.then(async () => {
        if (mine !== epoch) return;
        const samples = await audio;
        if (mine !== epoch) return;
        if (!samples || samples.length === 0) {
          await new Promise<void>((resolve) =>
            fallback.speak(text, {
              onStart: callbacks.onStart,
              onDone: () => {
                resolve();
                callbacks.onDone?.();
              },
              onError: (error) => {
                resolve();
                callbacks.onError?.(error);
              },
            }),
          );
          return;
        }
        callbacks.onStart?.();
        try {
          await backend.play(samples, (stop) => {
            stopCurrent = stop;
          });
        } catch (error) {
          stopCurrent = null;
          if (mine === epoch) callbacks.onError?.(error);
          return;
        }
        stopCurrent = null;
        if (mine === epoch) callbacks.onDone?.();
      });
    },
    stop() {
      epoch += 1;
      stopCurrent?.();
      stopCurrent = null;
      fallback.stop();
      tail = Promise.resolve();
    },
  };
}
