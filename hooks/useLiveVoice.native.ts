import { useCallback, useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { AudioRecorder } from 'react-native-audio-api';
import { models, useSpeechToText } from 'react-native-executorch';

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
}

export function useLiveVoice(options: UseLiveVoiceOptions) {
  const model = useSpeechToText({
    model: models.speech_to_text.whisper_tiny(),
    vad: models.vad.fsmn_vad(),
  });
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const modelRef = useRef(model);
  modelRef.current = model;

  const recorderRef = useRef<AudioRecorder | null>(null);
  const consumerRef = useRef<Promise<void> | null>(null);
  const runningRef = useRef(false);
  const sessionRef = useRef(0);
  const [state, setState] = useState<VoiceState>('IDLE');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(async () => {
    const recorder = recorderRef.current;
    const consumer = consumerRef.current;
    if (!runningRef.current && !recorder && !consumer) return;

    setState('STOPPING');
    runningRef.current = false;
    sessionRef.current += 1;

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
        await consumer;
      } catch {
        // The consumer reports its own failure state when it owns the active session.
      }
    }

    recorderRef.current = null;
    consumerRef.current = null;
    setState('IDLE');
  }, []);

  const start = useCallback(async () => {
    if (runningRef.current) return;
    const session = sessionRef.current + 1;
    sessionRef.current = session;
    setError(null);
    setTranscript('');
    setState('REQUESTING_PERMISSION');

    if (Platform.OS !== 'android') {
      setError('This production voice path is currently Android-first.');
      setState('ERROR');
      return;
    }

    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    if (sessionRef.current !== session) return;
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
      setError('Microphone permission denied.');
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

    const stt = modelRef.current;
    if (!stt.isReady) {
      setError(stt.error?.message ?? 'Local speech model is not ready yet.');
      setState('ERROR');
      return;
    }

    setState('INITIALIZING');
    // react-native-audio-api takes the capture format in the constructor.
    // 16 kHz mono is what the local Whisper STT graph expects.
    const recorder = new AudioRecorder({ sampleRate: 16000, bufferLengthInSamples: 1600 });
    recorderRef.current = recorder;
    runningRef.current = true;

    recorder.onAudioReady((chunk) => {
      if (
        runningRef.current &&
        sessionRef.current === session &&
        (optionsRef.current.shouldAcceptAudio?.() ?? true)
      ) {
        stt.streamInsert(chunk.buffer.getChannelData(0));
      }
    });

    const consume = async () => {
      let finalized = '';
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
          if (committed.text) {
            finalized += committed.text;
            optionsRef.current.onFinal?.(committed.text.trim());
          }
          setTranscript(`${finalized}${nonCommitted.text}`.trim());
          if (runningRef.current) setState('LISTENING');
        }
      } catch (cause) {
        if (sessionRef.current !== session) return;
        runningRef.current = false;
        setError(cause instanceof Error ? cause.message : String(cause));
        setState('ERROR');
      }
    };

    consumerRef.current = consume();

    try {
      recorder.start();
      if (sessionRef.current !== session) {
        try {
          recorder.stop();
        } catch {
          // Cleanup of a superseded session is best-effort.
        }
        return;
      }
      setState('LISTENING');
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
    isReady: model.isReady,
    downloadProgress: model.downloadProgress,
    start,
    stop,
  };
}
