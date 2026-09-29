import { useCallback, useEffect, useRef, useState } from 'react';
import { PermissionsAndroid } from 'react-native';
import { AudioRecorder } from 'react-native-audio-api';
import { Endpointer, rms, toInt16 } from '@/lib/voice/endpointer';
import { IDLE_STATE, step, type LoopEvent, type LoopPhase, type LoopState } from '@/lib/voice/voiceLoop';
import { createWakeWordEngine, type WakeWordEngine } from '@/lib/voice/wakeWordEngine';

export interface HandsFreeOptions {
  language: 'en' | 'ar';
  /** Whisper, shared with the manual voice hook. */
  transcribe: (audio: Float32Array, language: 'en' | 'ar') => Promise<string>;
  sttReady: boolean;
  /** A command to answer. */
  onCommand: (command: string) => void;
  /** Silence JARVIS now: stop speaking and stop generating. */
  onInterrupt: () => void;
}

export interface HandsFreeController {
  running: boolean;
  phase: LoopPhase;
  /** 'openWakeWord' when the "hey jarvis" engine runs, 'spoken' when "Jarvis" is recognised in speech. */
  wakeEngine: 'openWakeWord' | 'spoken' | 'none';
  /** Microphone loudness, 0..1, for the orb. */
  level: number;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  /** The screen reports the voice: started, each sentence, finished. */
  report: (event: Extract<LoopEvent, { type: 'REPLY_STARTED' | 'SPOKEN' | 'REPLY_DONE' }>) => void;
}

/**
 * The hands-free loop: one microphone that stays open, the "hey jarvis" wake
 * word, turns that end by themselves, a follow-up window, and barge-in.
 *
 * The decisions all live in lib/voice/voiceLoop.ts and lib/voice/endpointer.ts
 * (pure, tested); this hook only wires the microphone, the wake-word engine
 * and Whisper to them. While IDLE with the wake-word engine running, nothing
 * that is said is transcribed at all: speech only reaches Whisper after the
 * wake word, during the follow-up window, or to check for a barge-in.
 */
export function useHandsFree(options: HandsFreeOptions): HandsFreeController {
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<LoopPhase>('IDLE');
  const [wakeEngine, setWakeEngine] = useState<HandsFreeController['wakeEngine']>('none');
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const optionsRef = useRef(options);
  optionsRef.current = options;
  const stateRef = useRef<LoopState>(IDLE_STATE);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const engineRef = useRef<WakeWordEngine | null>(null);
  const endpointerRef = useRef(new Endpointer());
  const transcribingRef = useRef(false);
  const lastLevelAt = useRef(0);

  const dispatch = useCallback((event: LoopEvent) => {
    const { state, actions } = step(stateRef.current, event);
    stateRef.current = state;
    setPhase(state.phase);
    for (const action of actions) {
      if (action.type === 'INTERRUPT') optionsRef.current.onInterrupt();
      if (action.type === 'SEND') optionsRef.current.onCommand(action.command);
    }
  }, []);

  const handleUtterance = useCallback(
    async (audio: Float32Array) => {
      // One transcription at a time; an utterance that arrives meanwhile is dropped
      // rather than queued behind a stale one.
      if (transcribingRef.current) return;
      transcribingRef.current = true;
      try {
        const text = await optionsRef.current.transcribe(audio, optionsRef.current.language);
        if (text) dispatch({ type: 'UTTERANCE', text, at: Date.now() });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        transcribingRef.current = false;
      }
    },
    [dispatch],
  );

  const stop = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    endpointerRef.current.reset();
    engineRef.current?.reset();
    stateRef.current = IDLE_STATE;
    setPhase('IDLE');
    setRunning(false);
    setLevel(0);
  }, []);

  const start = useCallback(async () => {
    if (recorderRef.current) return;
    setError(null);
    if (!optionsRef.current.sttReady) {
      setError('Local speech model is not ready yet.');
      return;
    }
    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
      setError('Microphone permission denied.');
      return;
    }
    engineRef.current ??= await createWakeWordEngine();
    setWakeEngine(engineRef.current ? 'openWakeWord' : 'spoken');

    const recorder = new AudioRecorder({ sampleRate: 16000, bufferLengthInSamples: 1600 });
    recorderRef.current = recorder;
    recorder.onAudioReady((chunk) => {
      if (recorderRef.current !== recorder) return;
      // Copy: the native buffer is reused for the next frame.
      const frame = Float32Array.from(chunk.buffer.getChannelData(0));
      const now = Date.now();
      if (now - lastLevelAt.current > 80) {
        lastLevelAt.current = now;
        setLevel(Math.min(1, rms(frame) * 8));
      }

      const phaseNow = stateRef.current.phase;
      const engine = engineRef.current;
      if (engine && (phaseNow === 'IDLE' || phaseNow === 'THINKING' || phaseNow === 'SPEAKING')) {
        if (engine.process(toInt16(frame)).detected) {
          engine.reset();
          endpointerRef.current.reset();
          dispatch({ type: 'WAKE', at: now });
          return;
        }
      }

      for (const event of endpointerRef.current.push(frame)) {
        if (event.type !== 'end') continue;
        // With the wake-word engine running, idle speech is never transcribed.
        if (engine && stateRef.current.phase === 'IDLE') continue;
        void handleUtterance(event.audio);
      }
    });
    recorder.start();
    setRunning(true);
  }, [dispatch, handleUtterance]);

  // Listening and follow-up windows close on their own.
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => dispatch({ type: 'TICK', at: Date.now() }), 500);
    return () => clearInterval(timer);
  }, [running, dispatch]);

  useEffect(() => stop, [stop]);

  const report = useCallback<HandsFreeController['report']>((event) => dispatch(event), [dispatch]);

  return { running, phase, wakeEngine, level, error, start, stop, report };
}
