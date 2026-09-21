import { useState, type ComponentType } from 'react';
import { AppText, Button, Card, Screen, Title } from '@/components/Ui';
import { useJarvis } from '@/context/JarvisContext';
import { errorMessage, humanizeError } from '@/lib/utils/errors';

export default function CoachBootstrapScreen() {
  const jarvis = useJarvis();
  const [RuntimeScreen, setRuntimeScreen] = useState<ComponentType | null>(null);
  const [loading, setLoading] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string>();

  async function startRuntime() {
    if (loading || RuntimeScreen) return;
    setLoading(true);
    setRuntimeError(undefined);
    try {
      const module = await import('@/components/CoachRuntimeScreen');
      setRuntimeScreen(() => module.default);
    } catch (error) {
      setRuntimeError(humanizeError(errorMessage(error, 'RUNTIME_START_FAILED')));
    } finally {
      setLoading(false);
    }
  }

  if (RuntimeScreen) return <RuntimeScreen />;

  return (
    <Screen>
      <Title>JARVIS</Title>
      <AppText muted>ROG Phone startup-safe shell · build 0.5 candidate</AppText>

      <Card title="Core startup">
        <AppText>App shell: READY</AppText>
        <AppText>Local storage: {jarvis.initError ? 'ERROR' : 'READY'}</AppText>
        <AppText>Model runtime: NOT LOADED</AppText>
        <AppText muted>
          AI, Whisper and microphone native engines are intentionally loaded only after this screen renders. This prevents a heavy native module from killing the process before JARVIS can show diagnostics.
        </AppText>
        {runtimeError ? <AppText muted>Runtime error: {runtimeError}</AppText> : null}
        <Button title={loading ? 'Starting runtime…' : 'Start JARVIS runtime'} disabled={loading} onPress={() => void startRuntime()} />
      </Card>

      <Card title="Why this gate exists">
        <AppText muted>
          If this screen stays open but the app exits only after starting the runtime, the failure is isolated to the AI/audio native stack instead of the Android app shell.
        </AppText>
      </Card>
    </Screen>
  );
}
