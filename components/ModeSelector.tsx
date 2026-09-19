import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { IntelligenceMode } from '@/lib/inference/types';
import { INTELLIGENCE_MODES } from '@/lib/inference/intelligenceModes';
import { colors } from './theme';

const MODES: IntelligenceMode[] = ['fast', 'deep', 'create', 'code'];

export function ModeSelector({ value, onChange }: { value: IntelligenceMode; onChange: (mode: IntelligenceMode) => void }) {
  return (
    <View style={styles.row}>
      {MODES.map((mode) => (
        <Pressable key={mode} style={[styles.item, value === mode && styles.active]} onPress={() => onChange(mode)}>
          <Text style={[styles.text, value === mode && styles.activeText]}>{INTELLIGENCE_MODES[mode].label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  item: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: colors.panel2 },
  active: { borderColor: colors.accent, backgroundColor: '#0C2A34' },
  text: { color: colors.muted, fontWeight: '700' },
  activeText: { color: colors.accent },
});
