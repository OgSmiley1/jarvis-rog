import { useMemo, useRef } from 'react';
import { AudioContext } from 'react-native-audio-api';
import { models, useTextToSpeech } from 'react-native-executorch';
import { ensureExecutorch } from '@/lib/voice/executorch';
import type { NeuralBackend } from '@/lib/voice/neuralSpeaker';

/** Kokoro's output rate is fixed by the model. */
const SAMPLE_RATE = 24_000;

/**
 * Kokoro-82M (Apache-2.0), British male "Daniel", on the phone. English only:
 * Kokoro has no Arabic voice, so Arabic stays on the phone's system voice.
 * Nothing is downloaded (~350 MB, once) until the owner turns it on.
 */
export function useKokoroVoice(enabled: boolean): { ready: boolean; progress: number; backend: NeuralBackend } {
  ensureExecutorch();
  const config = useMemo(() => models.text_to_speech.kokoro.en_gb.daniel(), []);
  const tts = useTextToSpeech(config, { preventLoad: !enabled });
  const ttsRef = useRef(tts);
  ttsRef.current = tts;
  const contextRef = useRef<AudioContext | null>(null);

  const backend = useMemo<NeuralBackend>(
    () => ({
      synthesize: (text) => ttsRef.current.forward({ text, speed: 1.0 }),
      play: (samples, onPlaying) =>
        new Promise<void>((resolve) => {
          contextRef.current ??= new AudioContext({ sampleRate: SAMPLE_RATE });
          const context = contextRef.current;
          const buffer = context.createBuffer(1, samples.length, SAMPLE_RATE);
          buffer.copyToChannel(samples, 0);
          const source = context.createBufferSource();
          source.buffer = buffer;
          source.connect(context.destination);
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            resolve();
          };
          source.onEnded = finish;
          onPlaying(() => {
            try {
              source.stop();
            } catch {
              // Already stopped.
            }
            finish();
          });
          source.start();
        }),
    }),
    [],
  );

  return { ready: enabled && tts.isReady, progress: tts.downloadProgress ?? 0, backend };
}
