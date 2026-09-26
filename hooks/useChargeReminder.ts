import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import * as Battery from 'expo-battery';
import * as Notifications from 'expo-notifications';
import { chargeReminderText, FRESH_REMINDERS, nextChargeReminder, type ReminderMemory } from '@/lib/device/chargeReminder';
import { recordLive } from '@/lib/telemetry/liveLog';

const CHANNEL = 'battery';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Watches the battery while JARVIS is running — on screen, or kept alive in
 * the background by hands-free listening or the floating orb — and reminds
 * the owner to charge: a notification always, and spoken aloud when JARVIS is
 * on screen. Android offers no way to wake a closed app for low battery.
 */
export function useChargeReminder(options: {
  enabled: boolean;
  threshold: number;
  language: 'en' | 'ar';
  speak: (text: string) => void;
}) {
  const speakRef = useRef(options.speak);
  speakRef.current = options.speak;
  const memory = useRef<ReminderMemory>(FRESH_REMINDERS);
  const { enabled, threshold, language } = options;

  useEffect(() => {
    if (!enabled || Platform.OS !== 'android') return;
    let reading = { level: -1, charging: false };
    let cancelled = false;

    void Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Battery reminders',
      importance: Notifications.AndroidImportance.HIGH,
    }).catch(() => undefined);

    const check = () => {
      const step = nextChargeReminder(memory.current, reading, threshold);
      memory.current = step.memory;
      if (!step.remind || cancelled) return;
      const { title, body } = chargeReminderText(step.remind, reading.level, language);
      recordLive('app', `charge reminder: ${step.remind}`, { level: reading.level });
      void Notifications.scheduleNotificationAsync({
        content: { title, body },
        trigger: { channelId: CHANNEL },
      }).catch(() => undefined);
      if (AppState.currentState === 'active') speakRef.current(body);
    };

    void Promise.all([Battery.getBatteryLevelAsync(), Battery.getBatteryStateAsync()])
      .then(([level, state]) => {
        reading = { level, charging: state === Battery.BatteryState.CHARGING || state === Battery.BatteryState.FULL };
        check();
      })
      .catch(() => undefined);

    const levelSub = Battery.addBatteryLevelListener(({ batteryLevel }) => {
      reading = { ...reading, level: batteryLevel };
      check();
    });
    const stateSub = Battery.addBatteryStateListener(({ batteryState }) => {
      reading = {
        ...reading,
        charging: batteryState === Battery.BatteryState.CHARGING || batteryState === Battery.BatteryState.FULL,
      };
      check();
    });

    return () => {
      cancelled = true;
      levelSub.remove();
      stateSub.remove();
    };
  }, [enabled, threshold, language]);
}
