import { describe, expect, it } from 'vitest';
import { chargeReminderText, FRESH_REMINDERS, nextChargeReminder, type ReminderMemory } from '@/lib/device/chargeReminder';

function run(readings: Array<[number, boolean]>, threshold = 0.2) {
  let memory: ReminderMemory = FRESH_REMINDERS;
  const said: string[] = [];
  for (const [level, charging] of readings) {
    const step = nextChargeReminder(memory, { level, charging }, threshold);
    memory = step.memory;
    if (step.remind) said.push(`${step.remind}@${level}`);
  }
  return said;
}

describe('charge reminder', () => {
  it('reminds once at the chosen level, not on every reading below it', () => {
    expect(run([[0.25, false], [0.2, false], [0.19, false], [0.18, false]])).toEqual(['low@0.2']);
  });

  it('reminds again at 10%', () => {
    expect(run([[0.21, false], [0.2, false], [0.12, false], [0.1, false], [0.09, false]])).toEqual(['low@0.2', 'critical@0.1']);
  });

  it('plugging in re-arms the reminder for the next discharge', () => {
    expect(run([[0.2, false], [0.2, true], [0.4, true], [0.4, false], [0.2, false]])).toEqual(['low@0.2', 'low@0.2']);
  });

  it('says once when full while charging', () => {
    expect(run([[0.98, true], [1, true], [1, true]])).toEqual(['full@1']);
  });

  it('starting below the level still reminds', () => {
    expect(run([[0.15, false]])).toEqual(['low@0.15']);
  });

  it('ignores an unreadable battery', () => {
    expect(run([[-1, false]])).toEqual([]);
  });

  it('words it in both languages', () => {
    expect(chargeReminderText('low', 0.19, 'en').body).toBe('Battery is at 19 percent. Time to charge.');
    expect(chargeReminderText('full', 1, 'ar').title).toBe('البطارية ممتلئة');
  });
});
