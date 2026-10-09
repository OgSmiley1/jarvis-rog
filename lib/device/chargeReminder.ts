/**
 * When to remind the owner about charging. Pure: the battery listener feeds
 * it readings and does what it returns.
 *
 * One reminder per discharge at the chosen level, one more at 10%, and one
 * "full, you can unplug" while charging. Plugging in re-arms the low
 * reminders; unplugging re-arms the full one.
 */

export type ChargeReminder = 'low' | 'critical' | 'full';

export interface ReminderMemory {
  low: boolean;
  critical: boolean;
  full: boolean;
}

export const FRESH_REMINDERS: ReminderMemory = { low: false, critical: false, full: false };
export const CRITICAL_LEVEL = 0.1;

export function nextChargeReminder(
  memory: ReminderMemory,
  reading: { level: number; charging: boolean },
  threshold: number,
): { remind: ChargeReminder | null; memory: ReminderMemory } {
  const { level, charging } = reading;
  if (level < 0) return { remind: null, memory };

  if (charging) {
    const next = { ...memory, low: false, critical: false };
    if (level >= 0.995 && !memory.full) return { remind: 'full', memory: { ...next, full: true } };
    return { remind: null, memory: next };
  }

  const next = { ...memory, full: false };
  if (level <= CRITICAL_LEVEL && !memory.critical) return { remind: 'critical', memory: { ...next, critical: true, low: true } };
  if (level <= threshold && !memory.low) return { remind: 'low', memory: { ...next, low: true } };
  return { remind: null, memory: next };
}

export function chargeReminderText(remind: ChargeReminder, level: number, lang: 'en' | 'ar'): { title: string; body: string } {
  const percent = Math.round(level * 100);
  if (lang === 'ar') {
    if (remind === 'full') return { title: 'البطارية ممتلئة', body: 'الشحن اكتمل. يمكنك فصل الشاحن.' };
    if (remind === 'critical') return { title: `البطارية ${percent}%`, body: 'البطارية منخفضة جدًا. اشحن الهاتف الآن.' };
    return { title: `البطارية ${percent}%`, body: 'حان وقت الشحن.' };
  }
  if (remind === 'full') return { title: 'Battery full', body: 'Charged to 100 percent. You can unplug.' };
  if (remind === 'critical') return { title: `Battery ${percent}%`, body: `Battery is at ${percent} percent. Plug in now.` };
  return { title: `Battery ${percent}%`, body: `Battery is at ${percent} percent. Time to charge.` };
}
