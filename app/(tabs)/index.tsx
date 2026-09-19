import { useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { AppText, Button, Card, Field, Row, Screen, Title } from '@/components/Ui';
import { JarvisOrb, type OrbState } from '@/components/JarvisOrb';
import { ModeSelector } from '@/components/ModeSelector';
import { useJarvis } from '@/context/JarvisContext';
import type { IntelligenceMode } from '@/lib/inference/types';
import { formatPerformance } from '@/lib/inference/performance';
import { speakResponse } from '@/lib/voice/voiceResponse';
import { useLiveVoice } from '@/hooks/useLiveVoice';
import { errorMessage, humanizeError } from '@/lib/utils/errors';

export default function CoachScreen() {
  const jarvis = useJarvis();
  const [mode, setMode] = useState<IntelligenceMode>(jarvis.settings.defaultMode);
  const [input, setInput] = useState('');
  const [response, setResponse] = useState('');
  const [busy, setBusy] = useState(false);
  const voice = useLiveVoice({
    language: jarvis.settings.language,
    onFinal: (text) => setInput((current) => `${current} ${text}`.trim()),
  });

  const orbState = useMemo<OrbState>(() => {
    if (voice.state === 'LISTENING' || voice.state === 'TRANSCRIBING') return 'LISTENING';
    if (busy) return 'THINKING';
    if (jarvis.modelState.status === 'error') return 'ERROR';
    if (jarvis.modelState.status === 'ready') return 'READY';
    return 'OFFLINE';
  }, [busy, jarvis.modelState.status, voice.state]);

  async function send() {
    if (!input.trim() || busy) return;
    setBusy(true);
    setResponse('');
    try {
      const result = await jarvis.ask(input, mode, (token) => setResponse((current) => current + token));
      setResponse(result.text);
      if (jarvis.settings.autoSpeak) speakResponse(result.text, jarvis.settings.language);
    } catch (error) {
      Alert.alert('JARVIS error', humanizeError(errorMessage(error)));
    } finally {
      setBusy(false);
    }
  }

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
            <Button title="Speak" onPress={() => speakResponse(response, jarvis.settings.language)} />
            <Button title="Save memory" onPress={() => void jarvis.saveMemory('Saved JARVIS insight', response)} />
          </Row>
        </Card>
      ) : null}
    </Screen>
  );
}
