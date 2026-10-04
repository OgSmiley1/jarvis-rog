import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import type { QrMatrix } from '@/lib/tools/localExtras';
import { colors } from './theme';

/**
 * Everything that is not the Core lives here, behind a gesture: the menu
 * sheet (long-press), the history sheet (edge swipe) and the first-run card.
 * Standard Modal + ScrollView, so TalkBack, RTL and the back button behave
 * the way Android users expect.
 */

export function Sheet({
  visible,
  onClose,
  title,
  rtl,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  rtl: boolean;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel={rtl ? 'إغلاق' : 'Close'} accessibilityRole="button" />
      <View style={[styles.sheet, rtl && styles.rtl]}>
        <View style={styles.grip} />
        <View style={[styles.header, rtl && styles.rowReverse]}>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <Pressable onPress={onClose} accessibilityRole="button" hitSlop={12} style={styles.close}>
            <Text style={styles.closeText}>{rtl ? 'إغلاق' : 'Close'}</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

export interface HistoryItem {
  id: string;
  question: string;
  answer: string;
  source: string;
  at: number;
  stale?: boolean;
  private?: boolean;
}

export function HistoryList({ items, rtl, onClear }: { items: HistoryItem[]; rtl: boolean; onClear: () => void }) {
  if (items.length === 0) {
    return <Text style={styles.muted}>{rtl ? 'لا شيء بعد في هذه الجلسة.' : 'Nothing yet this session.'}</Text>;
  }
  return (
    <View style={styles.list}>
      {[...items].reverse().map((item) => (
        <View key={item.id} style={styles.item} accessible accessibilityLabel={`${item.question}. ${item.answer}`}>
          <Text style={[styles.question, rtl && styles.textRtl]}>{item.question}</Text>
          <Text style={[styles.answer, rtl && styles.textRtl]} selectable>
            {item.answer}
          </Text>
          <Text style={[styles.meta, rtl && styles.textRtl]}>
            {new Date(item.at).toLocaleTimeString()} · {item.source}
            {item.stale ? (rtl ? ' · نسخة محفوظة' : ' · cached copy') : ''}
          </Text>
        </View>
      ))}
      <Pressable onPress={onClear} accessibilityRole="button" style={styles.clear}>
        <Text style={styles.clearText}>{rtl ? 'مسح السجل' : 'Clear history'}</Text>
      </Pressable>
    </View>
  );
}

/** A QR code made on the phone, drawn as one path. White quiet zone so any scanner reads it. */
export function QrView({ qr, size = 220 }: { qr: QrMatrix; size?: number }) {
  const quiet = 4;
  const total = qr.size + quiet * 2;
  return (
    <View style={styles.qrWrap} accessible accessibilityLabel={`QR code for ${qr.text}`}>
      <Svg width={size} height={size} viewBox={`0 0 ${total} ${total}`}>
        <Rect x={0} y={0} width={total} height={total} fill="#FFFFFF" />
        <Path d={qr.path} fill="#000000" transform={`translate(${quiet} ${quiet})`} />
      </Svg>
      <Text style={styles.qrText} numberOfLines={2} selectable>
        {qr.text}
      </Text>
    </View>
  );
}

export function FirstRunCard({ rtl, onDismiss, children }: { rtl: boolean; onDismiss: () => void; children?: React.ReactNode }) {
  return (
    <View style={styles.hintWrap} pointerEvents="box-none">
      <View style={[styles.hint, rtl && styles.rtl]}>
        <Text style={styles.hintTitle}>{rtl ? 'هذا JARVIS' : 'This is JARVIS'}</Text>
        <Text style={[styles.hintLine, rtl && styles.textRtl]}>{rtl ? '• المس الدائرة للتحدث، والمسها مرة أخرى للإيقاف.' : '• Tap the Core to talk. Tap again to stop.'}</Text>
        <Text style={[styles.hintLine, rtl && styles.textRtl]}>{rtl ? '• اضغط مطولًا للقائمة والإعدادات.' : '• Long-press for the menu and settings.'}</Text>
        <Text style={[styles.hintLine, rtl && styles.textRtl]}>{rtl ? '• اسحب من حافة الشاشة لرؤية السجل.' : '• Swipe in from the screen edge for history.'}</Text>
        {children}
        <Pressable onPress={onDismiss} accessibilityRole="button" style={styles.hintButton}>
          <Text style={styles.hintButtonText}>{rtl ? 'فهمت' : 'Got it'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    maxHeight: '82%',
    backgroundColor: colors.panel,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderColor: colors.border,
    borderWidth: 1,
    paddingBottom: 24,
  },
  rtl: { direction: 'rtl' },
  rowReverse: { flexDirection: 'row-reverse' },
  grip: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 10 },
  title: { color: colors.text, fontSize: 17, fontWeight: '800' },
  close: { paddingVertical: 6, paddingHorizontal: 8 },
  closeText: { color: colors.muted, fontWeight: '700' },
  body: { paddingHorizontal: 18, paddingBottom: 18, gap: 12 },
  muted: { color: colors.muted, fontSize: 14 },
  list: { gap: 12 },
  item: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12, gap: 6, backgroundColor: colors.panel2 },
  question: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  answer: { color: colors.text, fontSize: 15, lineHeight: 22 },
  meta: { color: colors.muted, fontSize: 11 },
  textRtl: { textAlign: 'right', writingDirection: 'rtl' },
  clear: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 16 },
  clearText: { color: colors.bad, fontWeight: '700' },
  qrWrap: { alignItems: 'center', gap: 8, paddingVertical: 8 },
  qrText: { color: colors.muted, fontSize: 12, maxWidth: 260, textAlign: 'center' },
  hintWrap: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', padding: 16 },
  hint: { backgroundColor: 'rgba(12,16,22,0.94)', borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 16, gap: 8 },
  hintTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  hintLine: { color: colors.text, fontSize: 14, lineHeight: 20 },
  hintButton: { alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.accent, marginTop: 4 },
  hintButtonText: { color: colors.accent, fontWeight: '800' },
});
