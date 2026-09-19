import type { PropsWithChildren } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AppText, Button, Card, Title } from './Ui';
import { colors } from './theme';
import { useJarvis } from '@/context/JarvisContext';

export function BootstrapGate({ children }: PropsWithChildren) {
  const jarvis = useJarvis();

  if (!jarvis.ready) {
    return (
      <View style={styles.wrap}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Title>JARVIS</Title>
        <AppText muted>Opening local memory and runtime…</AppText>
      </View>
    );
  }

  if (jarvis.initError) {
    return (
      <View style={styles.wrap}>
        <Card title="Local startup error">
          <AppText>{jarvis.initError}</AppText>
          <AppText muted>Your local data has not been erased. Retry initialization first.</AppText>
          <Button title="Retry" onPress={() => void jarvis.refresh().catch(() => undefined)} />
        </Card>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
});
