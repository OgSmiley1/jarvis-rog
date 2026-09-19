import { StyleSheet, Text, View } from 'react-native';
import { colors } from './theme';

export type OrbState = 'OFFLINE' | 'READY' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'TOOL_RUNNING' | 'ERROR';

export function JarvisOrb({ state }: { state: OrbState }) {
  return (
    <View style={styles.wrap}>
      <View style={[styles.orb, state === 'ERROR' && styles.error]}>
        <View style={styles.inner} />
      </View>
      <Text style={styles.label}>{state}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 12, paddingVertical: 16 },
  orb: { width: 132, height: 132, borderRadius: 66, borderWidth: 2, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center', backgroundColor: '#091820' },
  inner: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#113746', borderWidth: 1, borderColor: colors.accent },
  error: { borderColor: colors.bad },
  label: { color: colors.accent, fontWeight: '900', letterSpacing: 2 },
});
