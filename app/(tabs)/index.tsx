import { useMemo, useRef, useState } from 'react';
import { Alert, Share } from 'react-native';
import { AppText, Button, Card, Field, Row, Screen, Title } from '@/components/Ui';
import { JarvisOrb, type OrbState } from '@/components/JarvisOrb';
import { ModeSelector } from '@/components/ModeSelector';
import { useJarvis } from '@/context/JarvisContext';
import type { IntelligenceMode } from '@/lib/inference/types';
import { formatPerformance } from '@/lib/inference/performance';
import { speakResponse, systemSpeaker } from '@/lib/voice/voiceResponse';
import { SpeechQueue } from '@/lib/voice/speechQueue';
import { ReplyVoice } from '@/lib/voice/replyVoice';
import { recentTurns, recordTurn, stages, type TurnTiming } from '@/lib/voice/latency';
import { stripThinking } from '@/lib/voice/stripThinking';
import { appendHeard, startTurn } from '@/lib/voice/voiceTurn';
import { useLiveVoice } from '@/hooks/useLiveVoice';
import { errorMessage, humanizeError } from '@/lib/utils/errors';

export default function CoachScreen() {
  const jarvis = useJarvis();
  const [mode, setMode] = useState<IntelligenceMode>(jarvis.settings.defaultMode);
  const [input, setInput] = useState('');
  const [response, setResponse] = useState('');
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [lastTurn, setLastTurn] = useState<TurnTiming>();
  // When the last words were heard, and whether this turn came from the voice.
  const heardAtRef = useRef<number | null>(null);
  const timingRef = useRef<TurnTiming | null>(null);
  const replyRef = useRef<ReplyVoice | null>(null);
  const languageRef = useRef(jarvis.settings.language);
  languageRef.current = jarvis.settings.language;
  // One ordered voice for the whole screen: sentences play in order, and a
  // new turn or Stop silences it at once.
  const queue = useMemo(
    () =>
      new SpeechQueue(systemSpeaker(() => languageRef.current), {
        onSpeakingChange: setSpeaking,
        onFirstAudio: () => {
          const timing = timingRef.current;
          if (timing && !timing.firstAudioAt) {
            timing.firstAudioAt = Date.now();
            setLastTurn({ ...timing });
          }
        },
      }),
    [],
  );
  const voice = useLiveVoice({
    language: jarvis.settings.language,
    onFinal: (text) => {
      heardAtRef.current = Date.now();
      setInput((current) => appendHeard(current, text));
    },
  });

  const orbState = useMemo<OrbState>(() => {
    if (voice.state === 'LISTENING' || voice.state === 'TRANSCRIBING') return 'LISTENING';
    if (busy) return 'THINKING';
    if (jarvis.modelState.status === 'error') return 'ERROR';
    if (jarvis.modelState.status === 'ready') return 'READY';
    return 'OFFLINE';
  }, [busy, jarvis.modelState.status, voice.state]);

  async function send() {
    const turn = startTurn(input);
    if (!turn || busy) return;
    // The box and the transcript empty the moment a turn starts, so nothing
    // from this turn lingers into the next one.
    setInput(turn.nextInput);
    voice.clearTranscript();
    // A new question replaces whatever is still being said.
    replyRef.current?.cancel();
    queue.interrupt();

    const heardAt = heardAtRef.current ?? undefined;
    heardAtRef.current = null;
    const spokenTurn = jarvis.settings.autoSpeak || heardAt !== undefined;
    const timing: TurnTiming = { heardAt, askedAt: Date.now() };
    timingRef.current = timing;
    const reply = jarvis.settings.autoSpeak ? new ReplyVoice(queue) : null;
    replyRef.current = reply;

    setBusy(true);
    setResponse('');
    try {
      // This is the voice screen: the model's reasoning is switched off, so
      // it is neither generated (seconds saved) nor shown nor spoken. A
      // spoken turn uses the fast profile: short answers, first word sooner.
      const result = await jarvis.ask(
        turn.command,
        spokenTurn ? 'fast' : mode,
        (token) => {
          if (!timing.firstTokenAt) timing.firstTokenAt = Date.now();
          setResponse((current) => current + token);
          // Each finished sentence is spoken while the model keeps writing.
          reply?.push(token);
        },
        [],
        { voice: true },
      );
      setResponse(result.text);
      reply?.finish(result.text);
    } catch (error) {
      reply?.cancel();
      Alert.alert('JARVIS error', humanizeError(errorMessage(error)));
    } finally {
      timing.endedAt = Date.now();
      recordTurn(timing);
      setLastTurn({ ...timing });
      setBusy(false);
    }
  }

  function stopAll() {
    replyRef.current?.cancel();
    queue.interrupt();
    void jarvis.stopGeneration();
  }

  const lastStages = lastTurn ? stages(lastTurn) : undefined;
  const seconds = (value?: number) => (typeof value === 'number' ? `${(value / 1000).toFixed(1)} s` : '—');

  const voiceProgress = Math.max(0, Math.min(100, Math.round((voice.downloadProgress ?? 0) * 100)));

  return (
    <Screen>
      <Title>JARVIS</Title>
      <AppText muted>Local-first assistant · ROG Phone build 0.2</AppText>
      <JarvisOrb state={orbState} />

      <Card title="Runtime">
        <AppText>Model: {jarvis.modelState.modelName ?? jarvis.settings.modelName ?? 'Not selected'}</AppText>
        <AppText>Status: {jarvis.modelState.status}</AppText>
        <AppText>Acceleration: {jarvis.modelState.gpu ? 'GPU/accelerated backend active' : jarvis.modelState.reasonNoGPU ?? 'Not measured'}</AppText>
        <AppText>{formatPerformance(jarvis.lastMetrics)}</AppText>
        {lastStages ? (
          <AppText muted>
            Last turn · first word {seconds(lastStages.firstTokenMs)} · first audio {seconds(lastStages.firstAudioMs)} · you waited{' '}
            {seconds(lastStages.userWaitMs)}
          </AppText>
        ) : null}
        <Button title="Share voice timings" onPress={() => void Share.share({ message: JSON.stringify(recentTurns()) })} />
      </Card>

      <Card title="Active project">
        <AppText>{jarvis.activeProject?.name ?? 'No active project'}</AppText>
        <AppText muted>{jarvis.activeProject?.objective ?? 'Create a project to give JARVIS continuity.'}</AppText>
        {jarvis.activeProject?.lastCompletedStep ? <AppText>Last completed: {jarvis.activeProject.lastCompletedStep}</AppText> : null}
        {jarvis.activeProject?.nextAction ? <AppText>Next action: {jarvis.activeProject.nextAction}</AppText> : null}
      </Card>

      <Card title="Intelligence">
        <ModeSelector value={mode} onChange={setMode} />
      </Card>

      <Card title="Voice engine">
        <AppText>State: {voice.state}</AppText>
        <AppText>Local STT: {voice.isReady ? 'READY' : `PREPARING · ${voiceProgress}%`}</AppText>
        <AppText muted>Voice resources are cached locally after the first successful preparation. The microphone stops when this session stops or the app backgrounds.</AppText>
        {voice.error ? <AppText muted>Voice error: {voice.error}</AppText> : null}
      </Card>

      <Card title="Ask JARVIS">
        <Field value={input} onChangeText={setInput} placeholder="Type or use visible voice input…" multiline />
        {voice.transcript ? <AppText muted>Voice: {voice.transcript}</AppText> : null}
        <Row>
          <Button title={busy ? 'Thinking…' : 'Send'} onPress={() => void send()} disabled={busy || !input.trim()} />
          {busy || speaking ? <Button title="Stop" onPress={stopAll} /> : null}
          <Button
            title={voice.state === 'IDLE' || voice.state === 'ERROR' ? 'Start voice' : 'Stop voice'}
            disabled={(voice.state === 'IDLE' || voice.state === 'ERROR') && !voice.isReady}
            onPress={() => void (voice.state === 'IDLE' || voice.state === 'ERROR' ? voice.start() : voice.stop())}
          />
        </Row>
      </Card>

      {stripThinking(response) ? (
        <Card title="Response">
          <AppText>{stripThinking(response)}</AppText>
          <Row>
            <Button
              title="Speak"
              onPress={() => {
                queue.interrupt();
                speakResponse(response, jarvis.settings.language);
              }}
            />
            <Button title="Save memory" onPress={() => void jarvis.saveMemory('Saved JARVIS insight', response)} />
          </Row>
        </Card>
      ) : null}
    </Screen>
  );
}
