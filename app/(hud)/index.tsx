import { useCallback, useEffect, useState, type ComponentType } from 'react';
import { AppText, Button, Card, Screen, Title } from '@/components/Ui';
import { useJarvis } from '@/context/JarvisContext';
import { errorMessage, humanizeError } from '@/lib/utils/errors';

export default function CoachBootstrapScreen() {
  const jarvis = useJarvis();
  const [RuntimeScreen, setRuntimeScreen] = useState<ComponentType | null>(null);
  const [loading, setLoading] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string>();

  const startRuntime = useCallback(async () => {
    if (loading || RuntimeScreen) return;
    setLoading(true);
    setRuntimeError(undefined);
    try {
      const module = await import('@/components/JarvisHud');
      setRuntimeScreen(() => module.default);
    } catch (error) {
      setRuntimeError(humanizeError(errorMessage(error, 'RUNTIME_START_FAILED')));
    } finally {
      setLoading(false);
    }
  }, [loading, RuntimeScreen]);

  useEffect(() => {
    // Paint a lightweight shell first, then automatically start the real
    // JARVIS runtime. This preserves hands-free startup while preventing
    // heavy native AI/audio modules from being required during route evaluation.
    const task = setTimeout(() => {
      void startRuntime();
    }, 0);
    return () => clearTimeout(task);
  }, [startRuntime]);

  if (RuntimeScreen) return <RuntimeScreen />;

  return (
    <Screen>
      <Title>JARVIS</Title>
      <AppText muted>ROG Phone · starting local runtime…</AppText>

      <Card title="Core startup">
        <AppText>App shell: READY</AppText>
        <AppText>Local storage: {jarvis.initError ? 'ERROR' : 'READY'}</AppText>
        <AppText>AI/voice runtime: {loading ? 'STARTING' : runtimeError ? 'ERROR' : 'QUEUED'}</AppText>
        {runtimeError ? (
          <>
            <AppText muted>Runtime error: {runtimeError}</AppText>
            <Button title="Retry JARVIS runtime" onPress={() => void startRuntime()} />
          </>
        ) : (
          <AppText muted>JARVIS loads the local AI and voice stack immediately after the safe app shell is visible.</AppText>
        )}
      </Card>
    </Screen>
  );
}
