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
  wrap: { alignItems: 'center', gap: 2 },
  time: { color: colors.text, fontSize: 44, fontWeight: '200', letterSpacing: 4, fontVariant: ['tabular-nums'] },
  date: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 3 },
  status: { color: colors.muted, fontSize: 12, marginTop: 2 },
});
