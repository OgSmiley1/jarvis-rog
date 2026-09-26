import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { HudPage } from '@/lib/hud/hudCommands';

const ON = '#F2F6FA';
const OFF = '#5D7288';

/** The small icon row under the stage, as in the reference video: the orb page and the camera page. */
export function PageBar({ page, onChange, arabic }: { page: HudPage; onChange: (page: HudPage) => void; arabic: boolean }) {
  const item = (target: HudPage, label: string, icon: (color: string) => React.ReactNode) => {
    const active = page === target;
    return (
      <Pressable
        key={target}
        onPress={() => onChange(target)}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        accessibilityLabel={label}
        hitSlop={10}
        style={styles.item}
      >
        <Svg width={22} height={22} viewBox="0 0 22 22">
          {icon(active ? ON : OFF)}
        </Svg>
        <View style={[styles.dot, { backgroundColor: active ? ON : 'transparent' }]} />
      </Pressable>
    );
  };

  return (
    <View style={styles.bar} accessibilityRole="tablist">
      {item('orb', arabic ? 'جارفيس' : 'JARVIS', (color) => (
        <>
          <Circle cx={11} cy={11} r={8.5} fill="none" stroke={color} strokeWidth={1.6} />
          <Circle cx={11} cy={11} r={4} fill="none" stroke={color} strokeWidth={1.6} />
        </>
      ))}
      <View style={styles.divider} />
      {item('camera', arabic ? 'الكاميرا' : 'Camera', (color) => (
        <>
          <Rect x={2.5} y={6} width={17} height={12} rx={2.5} fill="none" stroke={color} strokeWidth={1.6} />
          <Path d="M8 6 L9.5 3.5 H12.5 L14 6" fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
          <Circle cx={11} cy={12} r={3.2} fill="none" stroke={color} strokeWidth={1.6} />
        </>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, paddingVertical: 8 },
  item: { alignItems: 'center', gap: 4, paddingHorizontal: 6 },
  dot: { width: 4, height: 4, borderRadius: 2 },
  divider: { width: 1, height: 16, backgroundColor: '#2A3646' },
});
