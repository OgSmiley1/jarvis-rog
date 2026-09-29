import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Share } from 'react-native';
import { AppText, Button, Card, Field, Row, Screen } from '@/components/Ui';
import { JarvisOrb, type OrbState } from '@/components/JarvisOrb';
import { DashboardClock } from '@/components/DashboardClock';
import { orbMood } from '@/lib/voice/orbState';
import { ModeSelector } from '@/components/ModeSelector';
import { useJarvis } from '@/context/JarvisContext';
import type { IntelligenceMode } from '@/lib/inference/types';
import { formatPerformance } from '@/lib/inference/performance';
import { speakResponse, systemSpeaker } from '@/lib/voice/voiceResponse';
import { SpeechQueue, type Speaker } from '@/lib/voice/speechQueue';
import { neuralSpeaker } from '@/lib/voice/neuralSpeaker';
import { useKokoroVoice } from '@/hooks/useKokoroVoice';
import { ReplyVoice } from '@/lib/voice/replyVoice';
import { recentTurns, recordTurn, stages, type TurnTiming } from '@/lib/voice/latency';
import { stripThinking } from '@/lib/voice/stripThinking';
import { appendHeard, startTurn } from '@/lib/voice/voiceTurn';
import { useLiveVoice } from '@/hooks/useLiveVoice';
import { useHandsFree } from '@/hooks/useHandsFree';
import { errorMessage, humanizeError } from '@/lib/utils/errors';

export default function CoachScreen() {
  const jarvis = useJarvis();
  const [mode, setMode] = useState<IntelligenceMode>(jarvis.settings.defaultMode);
  const [input, setInput] = useState('');
  const [response, setResponse] = useState('');
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [lastTurn, setLastTurn] = useState<TurnTiming>();
  // The home screen is a dashboard; the technical cards open on request.
  const [details, setDetails] = useState(false);
  // Which brain answered: the owner always sees whether a reply left the phone.
  const [source, setSource] = useState<string>();
  // When the last words were heard, and whether this turn came from the voice.
  const heardAtRef = useRef<number | null>(null);
  const timingRef = useRef<TurnTiming | null>(null);
  const replyRef = useRef<ReplyVoice | null>(null);
  const languageRef = useRef(jarvis.settings.language);
  languageRef.current = jarvis.settings.language;
  // The hands-free loop hears about the voice through these, set once the loop exists.
  const loopReportRef = useRef<ReturnType<typeof useHandsFree>['report'] | null>(null);
  const generatingRef = useRef(false);
  // Each answer has a number; only the latest may end the loop's turn. The
  // previous answer's promise is kept so a new one waits for it to stop.
  const turnRef = useRef(0);
  const activeTurnRef = useRef<Promise<void> | null>(null);
  // English answers use Kokoro once it is on and loaded; everything else,
  // and any sentence Kokoro cannot say, uses the phone's own voice.
  const kokoro = useKokoroVoice(Boolean(jarvis.settings.neuralVoiceEnabled));
  const neuralReadyRef = useRef(false);
  neuralReadyRef.current = kokoro.ready && jarvis.settings.language === 'en';
  const speaker = useMemo<Speaker>(() => {
    const system = systemSpeaker(() => languageRef.current);
    const neural = neuralSpeaker(kokoro.backend, system);
    return {
      speak: (text, callbacks) => (neuralReadyRef.current ? neural : system).speak(text, callbacks),
      stop: () => {
        neural.stop();
        system.stop();
      },
    };
  }, [kokoro.backend]);
  // One ordered voice for the whole screen: sentences play in order, and a
  // new turn or Stop silences it at once.
  const queue = useMemo(
    () =>
      new SpeechQueue(speaker, {
        onSpeakingChange: (value) => {
          setSpeaking(value);
          if (value) loopReportRef.current?.({ type: 'REPLY_STARTED', at: Date.now() });
          // The turn is over when the voice has finished AND the model has.
          else if (!generatingRef.current) loopReportRef.current?.({ type: 'REPLY_DONE', at: Date.now() });
        },
        onSentence: (text) => loopReportRef.current?.({ type: 'SPOKEN', text }),
        onFirstAudio: () => {
          const timing = timingRef.current;
          if (timing && !timing.firstAudioAt) {
            timing.firstAudioAt = Date.now();
            setLastTurn({ ...timing });
          }
        },
      }),
    [speaker],
  );
  const voice = useLiveVoice({
    language: jarvis.settings.language,
    onFinal: (text) => {
      heardAtRef.current = Date.now();
      setInput((current) => appendHeard(current, text));
    },
  });


  async function send() {
    const turn = startTurn(input);
    if (!turn || busy) return;
    // The box and the transcript empty the moment a turn starts, so nothing
    // from this turn lingers into the next one.
    setInput(turn.nextInput);
    voice.clearTranscript();
    const heardAt = heardAtRef.current ?? undefined;
    heardAtRef.current = null;
    await runTurn(turn.command, heardAt, jarvis.settings.autoSpeak);
  }

  /**
   * One answer, typed or hands-free. `speak` answers aloud; a hands-free turn
   * always does, whatever the auto-speak setting says.
   */
  async function runTurn(command: string, heardAt: number | undefined, speak: boolean) {
    const id = (turnRef.current += 1);
    // A new question replaces whatever is still being said or generated: the
    // model runs one answer at a time, so wait for the old one to stop.
    replyRef.current?.cancel();
    queue.interrupt();
    if (activeTurnRef.current) {
      await jarvis.stopGeneration().catch(() => undefined);
      await activeTurnRef.current.catch(() => undefined);
    }
    if (id !== turnRef.current) return;
    const done = answer(id, command, heardAt, speak);
    activeTurnRef.current = done;
    await done;
    if (activeTurnRef.current === done) activeTurnRef.current = null;
  }

  async function answer(id: number, command: string, heardAt: number | undefined, speak: boolean) {

    const spokenTurn = speak || heardAt !== undefined;
    const timing: TurnTiming = { heardAt, askedAt: Date.now() };
    timingRef.current = timing;
    const reply = speak ? new ReplyVoice(queue) : null;
    replyRef.current = reply;

    generatingRef.current = true;
    setBusy(true);
    setResponse('');
    try {
      // This is the voice screen: the model's reasoning is switched off, so
      // it is neither generated (seconds saved) nor shown nor spoken. A
      // spoken turn uses the fast profile: short answers, first word sooner.
      const result = await jarvis.ask(
        command,
        spokenTurn ? 'fast' : mode,
        (token) => {
          if (id !== turnRef.current) return;
          if (!timing.firstTokenAt) timing.firstTokenAt = Date.now();
          setResponse((current) => current + token);
          // Each finished sentence is spoken while the model keeps writing.
          reply?.push(token);
        },
        [],
        { voice: true, spoken: spokenTurn },
      );
      if (id !== turnRef.current) return;
      setResponse(result.text);
      setSource(result.source);
      reply?.finish(result.text);
    } catch (error) {
      reply?.cancel();
      // A turn cut off by a newer one is not an error the owner needs to see.
      if (id === turnRef.current) Alert.alert('JARVIS error', humanizeError(errorMessage(error)));
    } finally {
      timing.endedAt = Date.now();
      recordTurn(timing);
      setLastTurn({ ...timing });
      if (id === turnRef.current) {
        generatingRef.current = false;
        setBusy(false);
        // Nothing (left) to say: the turn ends now, not when a voice that never started stops.
        if (!queue.isSpeaking) loopReportRef.current?.({ type: 'REPLY_DONE', at: Date.now() });
      }
    }
  }

  function stopAll() {
    replyRef.current?.cancel();
    queue.interrupt();
    void jarvis.stopGeneration();
  }

  // Hands-free: wake word, turns that end by themselves, follow-up, barge-in.
  const handsFree = useHandsFree({
    language: jarvis.settings.language === 'ar' ? 'ar' : 'en',
    transcribe: voice.transcribe,
    sttReady: voice.isReady,
    onCommand: (command) => {
      setInput('');
      void runTurn(command, Date.now(), true);
    },
    onInterrupt: stopAll,
  });
  loopReportRef.current = handsFree.report;
  useEffect(() => {
    // The manual microphone and the hands-free loop never run together.
    if (handsFree.running && voice.state !== 'IDLE' && voice.state !== 'ERROR') void voice.stop();
  }, [handsFree.running, voice]);

  const lastStages = lastTurn ? stages(lastTurn) : undefined;
  const seconds = (value?: number) => (typeof value === 'number' ? `${(value / 1000).toFixed(1)} s` : '—');

  const voiceProgress = Math.max(0, Math.min(100, Math.round((voice.downloadProgress ?? 0) * 100)));

  const orbState: OrbState = orbMood({
    speaking,
    busy,
    loopPhase: handsFree.running ? handsFree.phase : undefined,
    manualListening: voice.state === 'LISTENING' || voice.state === 'TRANSCRIBING',
    modelStatus: jarvis.modelState.status,
  });
  const headline = {
    SPEAKING: 'Speaking — talk over me or say “stop” to interrupt',
    THINKING: 'Thinking…',
    LISTENING: handsFree.phase === 'FOLLOW_UP' ? 'Listening for a follow-up…' : 'Listening…',
    READY: handsFree.running
      ? handsFree.wakeEngine === 'openWakeWord'
        ? 'Say “Hey Jarvis”'
        : 'Say “Jarvis” and your question'
      : 'Tap the orb for hands-free',
    ERROR: 'The brain did not load — see Details',
    OFFLINE: 'No brain loaded — Settings → Model',
    PREPARING: 'Preparing…',
    TOOL_RUNNING: 'Working…',
    WATCHING: 'Looking…',
  }[orbState];

  /** The orb is the main control: stop JARVIS when it talks, otherwise start or stop hands-free. */
  function tapOrb() {
    if (speaking || busy) {
      stopAll();
      return;
    }
    if (handsFree.running) handsFree.stop();
    else if (voice.isReady) void handsFree.start();
  }

  return (
    <Screen>
      <JarvisOrb state={orbState} level={handsFree.level} onPress={tapOrb} label={headline} size={240} />
      <DashboardClock
        lang={jarvis.settings.language === 'ar' ? 'ar' : 'en'}
        status={{
          modelStatus: jarvis.modelState.status,
          modelName: jarvis.modelState.modelName ?? jarvis.settings.modelName,
          cloudReady: Boolean(jarvis.settings.cloudBrainEnabled),
          micOn: handsFree.running || voice.state === 'LISTENING' || voice.state === 'TRANSCRIBING',
        }}
      />

      {stripThinking(response) ? (
        <Card>
          <AppText>{stripThinking(response)}</AppText>
          {source ? (
            <AppText muted>
              {source === 'local' ? 'On this phone' : source === 'tool' ? 'Phone tool' : `Via ${source.slice('cloud:'.length)} (free cloud)`}
            </AppText>
          ) : null}
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

      <Card>
        <Field value={input} onChangeText={setInput} placeholder="Say “Jarvis…”, or type" multiline />
        {voice.transcript ? <AppText muted>Voice: {voice.transcript}</AppText> : null}
        <Row>
          <Button title={busy ? 'Thinking…' : 'Send'} onPress={() => void send()} disabled={busy || !input.trim()} />
          {busy || speaking ? <Button title="Stop" onPress={stopAll} /> : null}
          <Button
            title={handsFree.running ? 'Stop hands-free' : 'Hands-free'}
            disabled={!handsFree.running && !voice.isReady}
            onPress={() => (handsFree.running ? handsFree.stop() : void handsFree.start())}
          />
        </Row>
        {handsFree.error ? <AppText muted>Hands-free: {handsFree.error}</AppText> : null}
      </Card>

      <Button title={details ? 'Hide details' : 'Details'} onPress={() => setDetails((value) => !value)} />
      {details ? (
        <>
          <Card title="Runtime">
            <AppText>Model: {jarvis.modelState.modelName ?? jarvis.settings.modelName ?? 'Not selected'}</AppText>
            <AppText>Status: {jarvis.modelState.status}</AppText>
            <AppText>
              Acceleration: {jarvis.modelState.gpu ? 'GPU/accelerated backend active' : jarvis.modelState.reasonNoGPU ?? 'Not measured'}
            </AppText>
            <AppText>{formatPerformance(jarvis.lastMetrics)}</AppText>
            {lastStages ? (
              <AppText muted>
                Last turn · first word {seconds(lastStages.firstTokenMs)} · first audio {seconds(lastStages.firstAudioMs)} · you waited{' '}
                {seconds(lastStages.userWaitMs)}
              </AppText>
            ) : null}
            <Button title="Share voice timings" onPress={() => void Share.share({ message: JSON.stringify(recentTurns()) })} />
          </Card>

          <Card title="Voice engine">
            <AppText>Manual mic: {voice.state} · hands-free: {handsFree.running ? handsFree.phase : 'off'}</AppText>
            <AppText>Wake word: {handsFree.wakeEngine === 'openWakeWord' ? 'openWakeWord “hey jarvis”' : handsFree.wakeEngine === 'spoken' ? '“Jarvis” heard in speech' : 'not started'}</AppText>
            <AppText>Local STT: {voice.isReady ? 'READY' : `PREPARING · ${voiceProgress}%`}</AppText>
            <AppText>Voice: {kokoro.ready && jarvis.settings.language === 'en' ? 'Kokoro (natural)' : 'phone system voice'}</AppText>
            {voice.error ? <AppText muted>Voice error: {voice.error}</AppText> : null}
            <Button
              title={voice.state === 'IDLE' || voice.state === 'ERROR' ? 'Manual voice input' : 'Stop voice input'}
              disabled={handsFree.running || ((voice.state === 'IDLE' || voice.state === 'ERROR') && !voice.isReady)}
              onPress={() => void (voice.state === 'IDLE' || voice.state === 'ERROR' ? voice.start() : voice.stop())}
            />
          </Card>

          <Card title="Active project">
            <AppText>{jarvis.activeProject?.name ?? 'No active project'}</AppText>
            <AppText muted>{jarvis.activeProject?.objective ?? 'Create a project to give JARVIS continuity.'}</AppText>
            {jarvis.activeProject?.nextAction ? <AppText>Next action: {jarvis.activeProject.nextAction}</AppText> : null}
          </Card>

          <Card title="Intelligence (typed questions)">
            <ModeSelector value={mode} onChange={setMode} />
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
