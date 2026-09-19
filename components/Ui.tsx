import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from './theme';

export function Screen({ children, scroll = true }: PropsWithChildren<{ scroll?: boolean }>) {
  const body = scroll ? <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView> : <View style={styles.content}>{children}</View>;
  return <SafeAreaView style={styles.screen}>{body}</SafeAreaView>;
}

export function Card({ children, title }: PropsWithChildren<{ title?: string }>) {
  return (
    <View style={styles.card}>
      {title ? <Text style={styles.cardTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

export function AppText({ children, muted = false }: PropsWithChildren<{ muted?: boolean }>) {
  return <Text style={[styles.text, muted && styles.muted]}>{children}</Text>;
}

export function Title({ children }: PropsWithChildren) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Button({ title, onPress, disabled = false, danger = false }: { title: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.button, danger && styles.danger, disabled && styles.disabled]}>
      <Text style={styles.buttonText}>{title}</Text>
    </Pressable>
  );
}

export function Field({ value, onChangeText, placeholder, multiline = false }: { value: string; onChangeText: (value: string) => void; placeholder?: string; multiline?: boolean }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      multiline={multiline}
      style={[styles.input, multiline && styles.multiline]}
    />
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12, paddingBottom: 120 },
  card: { backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 16, gap: 10 },
  cardTitle: { color: colors.accent, fontSize: 13, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  title: { color: colors.text, fontSize: 28, fontWeight: '800', marginBottom: 2 },
  text: { color: colors.text, fontSize: 15, lineHeight: 21 },
  muted: { color: colors.muted },
  button: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', flexGrow: 1 },
  danger: { backgroundColor: colors.bad },
  disabled: { opacity: 0.4 },
  buttonText: { color: '#001018', fontWeight: '900' },
  input: { color: colors.text, backgroundColor: colors.panel2, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 48 },
  multiline: { minHeight: 120, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
});
