import { describe, expect, it } from 'vitest';
import { partOfDay, wakeGreeting } from '@/lib/hud/greeting';
import { buildMessages, PERSONA } from '@/lib/inference/promptBuilder';

describe('wake greeting', () => {
  it('greets by time of day on the first wake', () => {
    expect(wakeGreeting({ firstOfSession: true, hour: 9, lang: 'en' })).toBe('Good morning. What can I do?');
    expect(wakeGreeting({ firstOfSession: true, hour: 2, lang: 'en' })).toBe('Still up, I see. What can I do?');
  });
  it('offers to continue the active project', () => {
    expect(
      wakeGreeting({ firstOfSession: true, hour: 20, lang: 'en', project: { name: 'the Pi setup', nextAction: 'flash the SD card' } }),
    ).toBe('Good evening. We were on the Pi setup — next was flash the SD card. Want to pick it up?');
  });
  it('stays short after the first wake', () => {
    expect(wakeGreeting({ firstOfSession: false, hour: 20, lang: 'en', project: { name: 'x' } })).toBe('Yes?');
  });
  it('Arabic', () => {
    expect(wakeGreeting({ firstOfSession: true, hour: 8, lang: 'ar' })).toBe('صباح الخير. معاك.');
  });
  it('day boundaries', () => {
    expect([4, 5, 11, 12, 16, 17, 22, 23].map(partOfDay)).toEqual([
      'night', 'morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening', 'night',
    ]);
  });
});

describe('persona', () => {
  it('is in every system prompt, and short', () => {
    const [system] = buildMessages({ mode: 'fast', userMessage: 'hi' });
    expect(system?.content).toContain(PERSONA);
    expect(PERSONA.length).toBeLessThan(320);
  });
});
