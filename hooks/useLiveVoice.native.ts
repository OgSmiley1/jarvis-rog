import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_ENDPOINTER, Endpointer } from '@/lib/voice/endpointer';
import { runtimeObservations } from '@/lib/diagnostics/runtime';
import { checkMicrophonePermission, requestMicrophonePermission } from '@/lib/voice/microphone';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import { AudioRecorder } from 'react-native-audio-api';
import { models, useSpeechToText } from 'react-native-executorch';
import { ensureExecutorch } from '@/lib/voice/executorch';
import { levelFromFrame } from '@/lib/voice/audioLevel';
import { cleanTranscript } from '@/lib/voice/transcriptClean';
import { useLocalVoiceModel } from '@/hooks/useLocalVoiceModel';
import { gateFrame } from '@/lib/voice/wakeGate';
import type { WakeWordEngine } from '@/lib/voice/wakeWordEngine';

export type VoiceState =
  | 'IDLE'
  | 'REQUESTING_PERMISSION'
  | 'INITIALIZING'
  | 'LISTENING'
  | 'TRANSCRIBING'
  | 'STOPPING'
  | 'ERROR';

export interface UseLiveVoiceOptions {
  language: 'auto' | 'en' | 'ar';
  onFinal?: (text: string) => void;
  shouldAcceptAudio?: () => boolean;
  /**
   * An optional "hey jarvis" engine in front of speech recognition. With it,
   * frames reach Whisper only while `isAwake()` — the room is not transcribed
   * while JARVIS is asleep. `onWake` fires on each detection.
   */
  wakeGate?: { engine: WakeWordEngine; isAwake: () => boolean; onWake: () => void };
  /**
   * The owner stopped talking, measured on the audio itself (energy
   * endpointer, 0.8 s trailing silence): `msAgo` is how long ago the last
   * speech frame was. Used to time end-of-speech → first audio honestly.
   */
  onSpeechEnd?: (msAgo: number) => void;
}

export function useLiveVoice(options: UseLiveVoiceOptions) {
  ensureExecutorch();
  // Whisper and the voice detector, kept in Download/JARVIS once downloaded.
  const remote = useMemo(() => ({ model: models.speech_to_text.whisper_tiny(), vad: models.vad.fsmn_vad() }), []);
  const files = useLocalVoiceModel(remote);
  const model = useSpeechToText({ model: files.config.model, vad: files.config.vad, preventLoad: !files.ready });
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const modelRef = useRef(model);
  modelRef.current = model;

  const recorderRef = useRef<AudioRecorder | null>(null);
  const consumerRef = useRef<Promise<void> | null>(null);
  const runningRef = useRef(false);
  const startingRef = useRef(false);
  const stoppingRef = useRef(false);
  const sessionRef = useRef(0);
  const [state, setState] = useState<VoiceState>('IDLE');
  const [transcript, setTranscript] = useState('');
  const finalizedRef = useRef('');
  const [error, setError] = useState<string | null>(null);
  // Measured microphone level for the HUD ring. Held in a ref and published on
  // an interval: audio frames arrive every 100 ms, and re-rendering the tree
  // that often would compete with token streaming for the JS thread.
  const captureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstFrame = useRef(false);
  const levelRef = useRef(0);
  const [level, setLevel] = useState(0);

  const stop = useCallback(async () => {
    if (captureTimer.current) clearTimeout(captureTimer.current);
    const recorder = recorderRef.current;
    const consumer = consumerRef.current;
    // Invalidate permission requests too: Stop must work before a recorder exists.
    sessionRef.current += 1;
    const stoppedSession = sessionRef.current;
    startingRef.current = false;
    if (!runningRef.current && !recorder && !consumer) {
      setState('IDLE');
      return;
    }

    stoppingRef.current = true;
    setState('STOPPING');
    runningRef.current = false;

    try {
      modelRef.current.streamStop();
    } catch {
      // Stream may already be closed.
    }

    try {
      if (recorder) recorder.stop();
    } catch {
      // Recorder cleanup is best-effort; the session must still terminate.
    }

    if (consumer) {
      try {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try { await Promise.race([consumer, new Promise<void>(resolve => { timer = setTimeout(resolve, 750); })]); }
        finally { if (timer) clearTimeout(timer); }
      } catch {
        // The consumer reports its own failure state when it owns the active session.
      }
    }

    // An older stop must not clear a recorder started while its stream drained.
    if (sessionRef.current !== stoppedSession) return;
    stoppingRef.current = false;
    recorderRef.current = null;
    consumerRef.current = null;
    levelRef.current = 0;
    setLevel(0);
    setState('IDLE');
  }, []);

  const start = useCallback(async () => {
    if (runningRef.current || startingRef.current || stoppingRef.current) return;
    startingRef.current = true;
    const session = sessionRef.current + 1;
    sessionRef.current = session;
    try {
      setError(null);
      setTranscript('');
      setState('REQUESTING_PERMISSION');

      if (Platform.OS !== 'android') {
        setError('This production voice path is currently Android-first.');
        setState('ERROR');
        return;
      }

      if (AppState.currentState !== 'active') throw new Error('Open JARVIS before starting the microphone.');
      const granted = await requestMicrophonePermission();
      if (sessionRef.current !== session) return;
      if (granted !== 'granted') {
        setError(granted === 'blocked' ? 'Microphone blocked. Open Android app permissions to allow Microphone.' : 'Microphone permission is required for voice input. Tap Talk to allow it.');
        setState('ERROR');
        return;
      }

      if (Platform.Version >= 33) {
        try {
          await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
        } catch {
          // Notification permission is helpful for the visible foreground-service
          // notification, but a denial must not fake a microphone failure.
        }
      }

      if (sessionRef.current !== session) return;
      const stt = modelRef.current;
      if (!stt.isReady) {
        setError(stt.error?.message ?? 'Local speech model is not ready yet.');
        setState('ERROR');
        return;
      }

      if (AppState.currentState !== 'active') throw new Error('Open JARVIS before starting the microphone.');
      setState('INITIALIZING');
      firstFrame.current = false;
      // react-native-audio-api takes the capture format in the constructor.
      // 16 kHz mono is what the local Whisper STT graph expects.
      const recorder = new AudioRecorder({ sampleRate: 16000, bufferLengthInSamples: 1600 });
      const endpointer = new Endpointer();
      recorderRef.current = recorder;
      runningRef.current = true;

      recorder.onAudioReady((chunk) => {
        if (!runningRef.current || sessionRef.current !== session) return;
        if (!firstFrame.current) {
          firstFrame.current = true;
          if (captureTimer.current) clearTimeout(captureTimer.current);
          runtimeObservations.microphoneCaptureAt = Date.now();
          setState('LISTENING');
        }
        if (
          runningRef.current &&
          sessionRef.current === session &&
          (optionsRef.current.shouldAcceptAudio?.() ?? true)
        ) {
          const frame = chunk.buffer.getChannelData(0);
          levelRef.current = levelFromFrame(frame, levelRef.current);
          const gate = optionsRef.current.wakeGate;
          const decision = gateFrame({ engineActive: Boolean(gate), accepting: true, awake: gate?.isAwake() ?? true });
          if (gate && decision.toEngine) {
            try {
              if (gate.engine.process(frame)) {
                gate.engine.reset();
                gate.onWake();
              }
            } catch {
              // A failing engine must never take the microphone down with it.
            }
          }
          if (decision.toSpeech) {
            try { stt.streamInsert(frame); }
            catch { void stop(); setError('Speech recognition stopped. Please try again.'); setState('ERROR'); return; }
            for (const event of endpointer.push(frame)) {
              if (event.type === 'end') optionsRef.current.onSpeechEnd?.(DEFAULT_ENDPOINTER.endSilenceMs);
            }
          } else {
            endpointer.reset();
          }
        } else {
          // Suppressed audio (JARVIS is speaking) must not drive the ring.
          levelRef.current = 0;
          endpointer.reset();
        }
      });

      const consume = async () => {
        finalizedRef.current = '';
        try {
          const language = optionsRef.current.language;
          const stream = stt.stream({
            verbose: false,
            useVAD: true,
            vadDetectionMargin: 500,
            ...(language === 'auto' ? {} : { language }),
          });

          for await (const { committed, nonCommitted } of stream) {
            if (!runningRef.current || sessionRef.current !== session) break;
            setState('TRANSCRIBING');
            const heard = cleanTranscript(committed.text ?? '');
            if (heard) {
              runtimeObservations.transcriptAt = Date.now();
              finalizedRef.current = `${finalizedRef.current} ${heard}`.trim();
              optionsRef.current.onFinal?.(heard);
            }
            setTranscript(`${finalizedRef.current} ${cleanTranscript(nonCommitted.text ?? '')}`.trim());
            if (runningRef.current) setState('LISTENING');
          }
        } catch (cause) {
          if (sessionRef.current !== session) return;
          if (captureTimer.current) clearTimeout(captureTimer.current);
          runningRef.current = false;
          try { recorder.stop(); } catch {}
          try { stt.streamStop(); } catch {}
          recorderRef.current = null;
          levelRef.current = 0;
          setError(cause instanceof Error ? cause.message : String(cause));
          setState('ERROR');
        }
      };

      consumerRef.current = consume();

      try {
        captureTimer.current = setTimeout(() => {
          if (sessionRef.current !== session || firstFrame.current) return;
          void stop().finally(() => { setError('No microphone audio arrived. Check Android microphone access and try again.'); setState('ERROR'); });
        }, 8000);
        recorder.start();
        if (sessionRef.current !== session) {
          try {
            recorder.stop();
          } catch {
            // Cleanup of a superseded session is best-effort.
          }
          return;
        }
      } catch (cause) {
        runningRef.current = false;
        try {
          stt.streamStop();
        } catch {}
        try {
          recorder.stop();
        } catch {}
        recorderRef.current = null;
        setError(cause instanceof Error ? cause.message : String(cause));
        setState('ERROR');
      }
    } catch (cause) {
      if (sessionRef.current !== session) return;
      setError(cause instanceof Error ? cause.message : String(cause));
      setState('ERROR');
    } finally {
      if (sessionRef.current === session) startingRef.current = false;
    }
  }, [stop]);

  useEffect(() => {
    // Publish the measured level while a session is live. Outside a session
    // there is no reading, and the HUD shows a resting orb rather than silence
    // it did not measure.
    if (state !== 'LISTENING' && state !== 'TRANSCRIBING') {
      setLevel(0);
      return;
    }

    const timer = setInterval(() => {
      setLevel((current) => (Math.abs(current - levelRef.current) < 0.02 ? current : levelRef.current));
    }, 100);
    return () => clearInterval(timer);
  }, [state]);

  useEffect(() => {
    void checkMicrophonePermission();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void checkMicrophonePermission().then((permission) => {
        if (permission !== 'granted' && runningRef.current) void stop();
      });
    });
    return () => subscription.remove();
  }, [stop]);

  const clearTranscript = useCallback(() => {
    finalizedRef.current = '';
    setTranscript('');
  }, []);

  useEffect(() => {
    // Keep the active recorder alive when the app is backgrounded. On Android
    // the react-native-audio-api recorder is backed by a microphone foreground
    // service (configured in app.config.ts), so the session can continue while
    // the app is minimized. We still release the microphone when this hook is
    // actually unmounted or the owner stops the session.
    return () => {
      void stop();
    };
  }, [stop]);

  return {
    state,
    transcript,
    error,
    /** Measured microphone level, 0..1. Zero whenever no session is capturing. */
    level,
    isReady: model.isReady,
    // While the files are fetched into the permanent folder, that is the progress to show.
    downloadProgress: files.ready ? model.downloadProgress : files.progress,
    start,
    stop,
    /** Start the next turn with an empty transcript, without restarting the microphone. */
    clearTranscript,
  };
}
