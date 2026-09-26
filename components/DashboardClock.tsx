import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BatteryState, usePowerState } from 'expo-battery';
import { colors } from './theme';
import { formatClock, statusLine, type StatusInput } from '@/lib/hud/dashboard';

/**
 * Time, date and the one-line status, as in the owner's reference video.
 * Re-renders on the minute, not every second: a clock that ticks seconds
 * would redraw the HUD sixty times more for nothing.
 */
export function DashboardClock({ lang, status }: { lang: 'en' | 'ar'; status: Omit<StatusInput, 'battery' | 'charging'> }) {
  const [now, setNow] = useState(() => new Date());
  const power = usePowerState();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const current = new Date();
      setNow(current);
      timer = setTimeout(tick, 60_000 - current.getSeconds() * 1000 - current.getMilliseconds() + 50);
    };
    tick();
    return () => clearTimeout(timer);
  }, []);

  const { time, date } = formatClock(now, lang);
  const charging = power.batteryState === BatteryState.CHARGING || power.batteryState === BatteryState.FULL;

  return (
    <View style={styles.wrap}>
      <Text style={styles.time} accessibilityLabel={`${time}, ${date}`}>
        {time}
      </Text>
      <Text style={styles.date}>{date}</Text>
      <Text style={styles.status} numberOfLines={1}>
        {statusLine({ ...status, battery: power.batteryLevel, charging }, lang)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 3 },
  // The reference video's clock: heavy monospace digits, a tiny spaced date under them.
  time: { color: '#F2F6FA', fontSize: 40, fontWeight: '700', fontFamily: 'monospace', letterSpacing: 4 },
  date: { color: '#8EA2BA', fontSize: 10, fontWeight: '600', letterSpacing: 3 },
  status: { color: colors.muted, fontSize: 11, marginTop: 4, opacity: 0.8 },
});
