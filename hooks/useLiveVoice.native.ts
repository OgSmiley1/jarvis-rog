import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
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
      // Stream may already be closed.    }

    try {
      if (recorder) await recorder.stop();
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

    const stt = modelRef.current;
    if (!stt.isReady) {
      setError(stt.error?.message ?? 'Local speech model is not ready yet.');
      setState('ERROR');
      return;
    }

    setState('INITIALIZING');
    const recorder = new AudioRecorder();
    recorderRef.current = recorder;
    runningRef.current = true;

    recorder.onAudioReady(
      { sampleRate: 16000, bufferLength: 1600, channelCount: 1 },
      (chunk) => {
        if (runningRef.current && sessionRef.current === session) {
          stt.streamInsert(chunk.buffer.getChannelData(0));
        }
      },
    );

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
      await recorder.start();
      if (sessionRef.current !== session) {
        await recorder.stop().catch(() => undefined);
        return;
      }
      setState('LISTENING');
    } catch (cause) {
      runningRef.current = false;
      try {
        stt.streamStop();
      } catch {}
      try {
        await recorder.stop();
      } catch {}
      recorderRef.current = null;
      setError(cause instanceof Error ? cause.message : String(cause));
      setState('ERROR');
    }
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') void stop();
    });
    return () => {
      subscription.remove();
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
