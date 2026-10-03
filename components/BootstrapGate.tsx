import { JarvisOrb } from './JarvisOrb';
import { CoreBoundary } from './CoreBoundary';
import type { PropsWithChildren } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AppText, Title } from './Ui';
import { colors } from './theme';
import { useJarvis } from '@/context/JarvisContext';

export function BootstrapGate({ children }: PropsWithChildren) {
  const jarvis = useJarvis();

  if (!jarvis.ready) {
    return (
      <View style={styles.wrap}>
        <CoreBoundary onPress={() => undefined}><JarvisOrb state="PREPARING" activity="model_loading" size={240} label="INITIALIZING" showLabel /></CoreBoundary>
        <ActivityIndicator size="large" color={colors.accent} />
        <Title>JARVIS</Title>
        <AppText muted>Opening local memory and runtime…</AppText>
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
