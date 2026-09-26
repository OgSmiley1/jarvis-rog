import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AudioContext } from 'react-native-audio-api';
import { models, useTextToSpeech } from 'react-native-executorch';
import { ensureExecutorch } from '@/lib/voice/executorch';
import { NeuralSpeechQueue, type NeuralPlayer } from '@/lib/voice/neuralSpeechQueue';
import { registerNeuralPreviewer, setNeuralVoiceStatus } from '@/lib/voice/neuralVoiceStore';
import { SpeechStream } from '@/lib/voice/speechStream';
import { speakQueued } from '@/lib/voice/voiceResponse';

/**
 * Kokoro, on-device, British male ("Daniel") — the human-sounding voice.
 *
 * Runs on react-native-executorch, the runtime already doing speech
 * recognition in this app, so it adds no native code and no dependency.
 * Kokoro's output rate is fixed by the model: kSamplingRate = 24000 in
 * react-native-executorch's kokoro/Constants.h.
 *
 * English only. Kokoro has no Arabic voice; Arabic answers keep using the
 * phone's best neural voice, chosen by lib/voice/voiceCatalog.ts.
 */
const KOKORO_SAMPLE_RATE = 24_000;

export interface UseNeuralVoiceOptions {
  /** Owner turned the neural voice on in Settings. */
  enabled: boolean;
  language: 'en' | 'ar';
  onSpeakingChange?: (speaking: boolean) => void;
}

export interface NeuralVoiceController {
  /** Kokoro is loaded and the current language is one it speaks. */
  isReady: boolean;
  /** Queue one sentence; plays as soon as the previous one finishes. */
  enqueue: (sentence: string) => void;
  /** Speak a whole reply, segmented into sentences. */
  speakAll: (text: string) => void;
  /** Barge-in: stop everything now. */
  stop: () => void;
}

export function useNeuralVoice({ enabled, language, onSpeakingChange }: UseNeuralVoiceOptions): NeuralVoiceController {
  ensureExecutorch();

  const usable = enabled && language === 'en';
  // Created once: the registry returns a new object per call, and a new
  // config every render could make the hook treat it as a new model.
  const config = useMemo(() => models.text_to_speech.kokoro.en_gb.daniel(), []);
  // preventLoad keeps the ~351 MB download from starting until the owner
  // actually turns the neural voice on.
  const tts = useTextToSpeech(config, { preventLoad: !usable });

  const ttsRef = useRef(tts);
  ttsRef.current = tts;
  const speakingCallbackRef = useRef(onSpeakingChange);
  speakingCallbackRef.current = onSpeakingChange;

  const contextRef = useRef<AudioContext | null>(null);
  const queueRef = useRef<NeuralSpeechQueue | null>(null);

  const getQueue = useCallback((): NeuralSpeechQueue => {
    if (queueRef.current) return queueRef.current;

    const player: NeuralPlayer = {
      now: () => contextRef.current?.currentTime ?? 0,
      schedule: (samples, at) => {
        if (!contextRef.current) contextRef.current = new AudioContext({ sampleRate: KOKORO_SAMPLE_RATE });
        const context = contextRef.current;
        const buffer = context.createBuffer(1, samples.length, KOKORO_SAMPLE_RATE);
        buffer.copyToChannel(samples, 0);
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);

        let endedCallback: (() => void) | undefined;
        let ended = false;
        const finish = () => {
          if (ended) return;
          ended = true;
          endedCallback?.();
        };
        source.onEnded = finish;
        source.start(Math.max(at, context.currentTime));

        return {
          duration: samples.length / KOKORO_SAMPLE_RATE,
          onEnded: (callback) => {
            endedCallback = callback;
          },
          stop: () => {
            try {
              source.stop();
            } catch {
              // Already stopped.
            }
            finish();
          },
        };
      },
    };

    queueRef.current = new NeuralSpeechQueue({
      synthesize: (text) => ttsRef.current.forward({ text, speed: 1.0 }),
      player,
      // A sentence Kokoro cannot synthesise is still spoken, by the phone's voice.
      fallback: (text) => speakQueued(text, 'en'),
      onSpeakingChange: (speaking) => speakingCallbackRef.current?.(speaking),
    });
    return queueRef.current;
  }, []);

  const isReady = usable && tts.isReady;

  const enqueue = useCallback((sentence: string) => getQueue().enqueue(sentence), [getQueue]);

  const speakAll = useCallback(
    (text: string) => {
      const stream = new SpeechStream();
      for (const sentence of [...stream.push(text), ...stream.flush()]) getQueue().enqueue(sentence);
    },
    [getQueue],
  );

  const stop = useCallback(() => queueRef.current?.stop(), []);

  // Publish status for Settings, which must not load a second copy of Kokoro.
  useEffect(() => {
    setNeuralVoiceStatus({
      enabled,
      ready: isReady,
      progress: tts.downloadProgress ?? 0,
      error: tts.error ? String(tts.error.message ?? tts.error) : undefined,
      unavailableReason:
        enabled && language !== 'en' ? 'Kokoro has no Arabic voice; Arabic uses the phone’s best voice.' : undefined,
    });
  }, [enabled, isReady, language, tts.downloadProgress, tts.error]);

  useEffect(() => {
    registerNeuralPreviewer(
      isReady
        ? async (text) => {
            queueRef.current?.stop();
            speakAll(text);
          }
        : undefined,
    );
    return () => registerNeuralPreviewer(undefined);
  }, [isReady, speakAll]);

  // Release the audio context when the HUD unmounts or the voice is switched off.
  useEffect(() => {
    if (usable) return;
    queueRef.current?.stop();
    queueRef.current = null;
    const context = contextRef.current;
    contextRef.current = null;
    void context?.close().catch(() => undefined);
  }, [usable]);

  useEffect(
    () => () => {
      queueRef.current?.stop();
      void contextRef.current?.close().catch(() => undefined);
    },
    [],
  );

  return { isReady, enqueue, speakAll, stop };
}
