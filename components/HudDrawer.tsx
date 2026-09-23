import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from './theme';

type Destination = { route: string; en: string; ar: string };

/**
 * Everything that used to be a tab. It is still one tap away — it just no
 * longer occupies the screen permanently. Order is by how often the owner
 * actually needs it, not alphabetically.
 */
const DESTINATIONS: Destination[] = [
  { route: '/chat', en: 'Chat', ar: 'محادثة' },
  { route: '/projects', en: 'Projects', ar: 'مشاريع' },
  { route: '/memory', en: 'Memory', ar: 'ذاكرة' },
  { route: '/understand', en: 'Understand', ar: 'تحليل' },
  { route: '/reflect', en: 'Reflect', ar: 'مراجعة' },
  { route: '/online', en: 'Free AI Hub', ar: 'نماذج مجانية' },
];

export function HudDrawer({ language, children }: { language: 'auto' | 'en' | 'ar'; children?: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const arabic = language === 'ar';

  return (
    <View style={styles.wrap}>
      <View style={styles.handleRow}>
        <Pressable
          onPress={() => setOpen((value) => !value)}
          accessibilityRole="button"
          accessibilityLabel={arabic ? 'قائمة أماكن العمل' : 'Workspaces menu'}
          style={styles.handle}
        >
          <View style={styles.grip} />
          <Text style={styles.handleText}>
            {open ? (arabic ? 'إخفاء' : 'Hide') : arabic ? 'أماكن العمل' : 'Workspaces'}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.push('/settings')}
          accessibilityRole="button"
          accessibilityLabel={arabic ? 'الإعدادات' : 'Settings'}
          style={styles.gear}
        >
          <Text style={styles.gearGlyph}>⚙</Text>
        </Pressable>
      </View>

      {open ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {DESTINATIONS.map((destination) => (
            <Pressable
              key={destination.route}
              onPress={() => {
                setOpen(false);
                router.push(destination.route as never);
              }}
              accessibilityRole="link"
              style={styles.chip}
            >
              <Text style={styles.chipText}>{arabic ? destination.ar : destination.en}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 18,
    gap: 10,
  },
  handleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  handle: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingRight: 12 },
  grip: { width: 34, height: 4, borderRadius: 2, backgroundColor: colors.border },
  handleText: { color: colors.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase' },
  gear: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  gearGlyph: { color: colors.muted, fontSize: 20 },
  chips: { gap: 8, paddingVertical: 4, paddingRight: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel2,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  chipText: { color: colors.text, fontWeight: '700', fontSize: 13 },
});
