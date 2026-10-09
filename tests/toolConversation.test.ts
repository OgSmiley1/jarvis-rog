import { describe, expect, it } from 'vitest';
import { ToolConversation } from '@/lib/tools/toolConversation';

describe('structured session tool context', () => {
  it('preserves tomorrow and units when changing location', () => {
    const c = new ToolConversation();
    c.resolve('weather in Ajman tomorrow in fahrenheit');
    expect(c.resolve('what about Dubai?')?.call).toMatchObject({ tool: 'live.weather', arguments: { city: 'Dubai', day: 'tomorrow', unit: 'fahrenheit' } });
    expect(c.resolve('and today?')?.call.arguments).toMatchObject({ city: 'Dubai', day: 'today', unit: 'fahrenheit' });
    expect(c.resolve('and in celsius?')?.call.arguments).toMatchObject({ city: 'Dubai', day: 'today', unit: 'celsius' });
  });
  it('retains prayer intent and date across English/Arabic follow-ups', () => {
    const c = new ToolConversation();
    c.resolve('prayer times in Ajman tomorrow');
    expect(c.resolve('ماذا عن دبي؟')?.call).toMatchObject({ tool: 'live.prayer', arguments: { city: 'دبي', tomorrow: true, all: true, lang: 'ar' } });
  });
  it('clears incompatible context when the subject changes', () => {
    const c = new ToolConversation();
    c.resolve('weather in Ajman tomorrow');
    c.resolve('explain quantum physics');
    expect(c.resolve('what about Dubai?')).toBeNull();
    c.resolve('prayer times in Ajman');
    c.resolve('2 plus 2');
    expect(c.snapshot()).toBeNull();
  });
  it('does not carry slots into a new explicit request', () => {
    const c = new ToolConversation();
    c.resolve('weather in Ajman tomorrow');
    expect(c.resolve('weather in London today')?.call.arguments).toMatchObject({ city: 'london', day: 'today' });
  });
  it('expires and clears on a new session', () => {
    let now = 0;
    const c = new ToolConversation(() => now);
    c.resolve('weather in Ajman tomorrow');
    now = 300001;
    expect(c.resolve('what about Dubai?')).toBeNull();
    c.resolve('prayer times in Ajman');
    expect(c.resolve('what about Dubai?', false)).toBeNull();
  });
});
it('routes mixed English/Arabic city names without losing location', () => {
  const c = new ToolConversation();
  expect(c.resolve('weather in دبي tomorrow')?.call.arguments).toMatchObject({ city: 'دبي', day: 'tomorrow' });
  expect(c.resolve('الطقس في Dubai بكرة')?.call.arguments).toMatchObject({ city: 'dubai', day: 'tomorrow' });
});
it('retains prayer intent for a known city alone, but clears an unrelated question', () => {
  const c = new ToolConversation();
  c.resolve('prayer times in Ajman');
  expect(c.resolve('Dubai?')?.call).toMatchObject({ tool: 'live.prayer', arguments: { city: 'Dubai', all: true } });
  c.resolve('Why is the sky blue?');
  expect(c.resolve('Dubai?')).toBeNull();
});
