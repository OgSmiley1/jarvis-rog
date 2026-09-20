import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { AppText, Button, Card, Field, Row, Screen, Title } from '@/components/Ui';
import { JarvisOrb, type OrbState } from '@/components/JarvisOrb';
import { ModeSelector } from '@/components/ModeSelector';
import { useJarvis } from '@/context/JarvisContext';
import type { IntelligenceMode } from '@/lib/inference/types';
import { formatPerformance } from '@/lib/inference/performance';
import { speakResponse } from '@/lib/voice/voiceResponse';
import { extractWakeCommand } from '@/lib/voice/wakeWord';
import { useLiveVoice } from '@/hooks/useLiveVoice';
import { errorMessage, humanizeError } from '@/lib/utils/errors';

export default function CoachScreen() {
  const jarvis = useJarvis();
  const [mode, setMode] = useState<IntelligenceMode>(jarvis.settings.defaultMode);
  const [input, setInput] = useState('');
  const [response, setResponse] = useState('');
  const [busy, setBusy] = useState(false);
  const awakeUntilRef = useRef(0);
  const autoStartAttemptedRef = useRef(false);
  const speakingRef = useRef(false);


  function speakJarvis(text: string) {
    speakingRef.current = true;
    void speakResponse(text, jarvis.settings.language, {
      onDone: () => {
        speakingRef.current = false;
      },
      onError: () => {
        speakingRef.current = false;
      },
    }).catch(() => {
      speakingRef.current = false;
    });
  }

  async function runCommand(commandText: string) {
    const command = commandText.trim();
    if (!command || busy) return;

    setBusy(true);
    setInput(command);
    setResponse('');

    try {
      const result = await jarvis.ask(command, mode, (token) => setResponse((current) => current + token));
      setResponse(result.text);

      if (jarvis.settings.autoSpeak || jarvis.settings.handsFreeEnabled) {
        speakJarvis(result.text);
      }
    } catch (error) {
      const message = humanizeError(errorMessage(error));
      setResponse(message);
      if (jarvis.settings.handsFreeEnabled) {
        speakJarvis(message);
      } else {
        Alert.alert('JARVIS error', message);
      }
    } finally {
      setBusy(false);
    }
  }

  function handleVoiceFinal(text: string) {
    const clean = text.trim();
    if (!clean || speakingRef.current) return;

    if (!jarvis.settings.handsFreeEnabled) {
      setInput((current) => `${current} ${clean}`.trim());
      return;
    }

    const wake = extractWakeCommand(clean, jarvis.settings.wakeWord);
    if (wake.heard) {
      if (wake.command) {
        awakeUntilRef.current = 0;
        void runCommand(wake.command);
      } else {
        awakeUntilRef.current = Date.now() + 10_000;
        speakJarvis(jarvis.settings.language === 'ar' ? 'معاك.' : 'Yes?');
      }
      return;
    }

    if (awakeUntilRef.current > Date.now()) {
      awakeUntilRef.current = 0;
      void runCommand(clean);
    }
  }

  const voice = useLiveVoice({
    language: jarvis.settings.language,
    onFinal: handleVoiceFinal,
    shouldAcceptAudio: () => !speakingRef.current,
  });

  useEffect(() => {
    if (!jarvis.settings.handsFreeEnabled) {
      autoStartAttemptedRef.current = false;
      return;
    }
    if (!voice.isReady || autoStartAttemptedRef.current) return;
    if (voice.state !== 'IDLE' && voice.state !== 'ERROR') return;

    autoStartAttemptedRef.current = true;
    void voice.start();
  }, [jarvis.settings.handsFreeEnabled, voice.isReady, voice.state, voice.start]);

  const orbState = useMemo<OrbState>(() => {
    if (voice.state === 'LISTENING' || voice.state === 'TRANSCRIBING') return 'LISTENING';
    if (busy) return 'THINKING';
    if (jarvis.modelState.status === 'error') return 'ERROR';
    if (jarvis.modelState.status === 'ready') return 'READY';
    return 'OFFLINE';
  }, [busy, jarvis.modelState.status, voice.state]);

  async function send() {
    await runCommand(input);
  }

  const voiceProgress = Math.max(0, Math.min(100, Math.round((voice.downloadProgress ?? 0) * 100)));

  return (
    <Screen>
      <Title>JARVIS</Title>
      <AppText muted>Voice-first personal AI · ROG Phone build 0.4</AppText>
      <JarvisOrb state={orbState} />

      <Card title="Runtime">
        <AppText>Model: {jarvis.modelState.modelName ?? jarvis.settings.modelName ?? 'Not selected'}</AppText>
        <AppText>Status: {jarvis.modelState.status}</AppText>
        <AppText>Acceleration: {jarvis.modelState.gpu ? 'GPU/accelerated backend active' : jarvis.modelState.reasonNoGPU ?? 'Not measured'}</AppText>
        <AppText>{formatPerformance(jarvis.lastMetrics)}</AppText>
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
        <AppText>Wake word: {jarvis.settings.wakeWord}</AppText>
        <AppText muted>
          {jarvis.settings.handsFreeEnabled
            ? 'Hands-free is ON. Say “Jarvis” followed by a command, or say “Jarvis” and speak the command within 10 seconds.'
            : 'Hands-free is OFF. Use Start voice when you want to dictate.'}
        </AppText>
        <AppText muted>
          On Android, an active hands-free session uses a visible foreground microphone service so it can remain active while the app is minimized.
        </AppText>
        {voice.error ? <AppText muted>Voice error: {voice.error}</AppText> : null}
      </Card>

      <Card title="Ask JARVIS">
        <Field value={input} onChangeText={setInput} placeholder="Say “Jarvis…” or type a command…" multiline />
        {voice.transcript ? <AppText muted>Heard: {voice.transcript}</AppText> : null}
        <Row>
          <Button title={busy ? 'Thinking…' : 'Send'} onPress={() => void send()} disabled={busy || !input.trim()} />
          {busy ? <Button title="Stop generation" onPress={() => void jarvis.stopGeneration()} /> : null}
          <Button
            title={voice.state === 'IDLE' || voice.state === 'ERROR' ? 'Start voice' : 'Stop voice'}
            disabled={(voice.state === 'IDLE' || voice.state === 'ERROR') && !voice.isReady}
            onPress={() => void (voice.state === 'IDLE' || voice.state === 'ERROR' ? voice.start() : voice.stop())}
          />
        </Row>
      </Card>

      {response ? (
        <Card title="Response">
          <AppText>{response}</AppText>
          <Row>
            <Button title="Speak" onPress={() => speakJarvis(response)} />
            <Button title="Save memory" onPress={() => void jarvis.saveMemory('Saved JARVIS insight', response)} />
          </Row>
        </Card>
      ) : null}
    </Screen>
  );
}
