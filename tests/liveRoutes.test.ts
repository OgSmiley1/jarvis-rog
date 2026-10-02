import { describe, expect, it } from 'vitest';
import { routeDeterministicTool } from '@/lib/tools/deterministicRouter';
import { toolRegistry } from '@/lib/tools/registry';
import { describeDuration, parseClockTime, parseDuration } from '@/lib/utils/durations';
import { makeQr } from '@/lib/tools/localExtras';

const call = (text: string) => routeDeterministicTool(text)?.call;

describe('live routes — no LLM for these', () => {
  it.each([
    ["what's the weather in Ajman", { tool: 'live.weather', city: 'ajman', day: 'today' }],
    ['Jarvis, how is the weather like in abu dhabi tomorrow?', { tool: 'live.weather', city: 'abu dhabi', day: 'tomorrow' }],
    ['weather', { tool: 'live.weather', day: 'today' }],
    ['is it going to rain tomorrow', { tool: 'live.weather', day: 'tomorrow' }],
    ['what is the temperature in london in fahrenheit', { tool: 'live.weather', city: 'london', unit: 'fahrenheit' }],
    ['كيف الجو في دبي بكرة', { tool: 'live.weather', city: 'دبي', day: 'tomorrow', lang: 'ar' }],
    ['when is maghrib', { tool: 'live.prayer', prayer: 'Maghrib' }],
    ['what time is fajr tomorrow', { tool: 'live.prayer', prayer: 'Fajr', tomorrow: true }],
    ['متى أذان المغرب', { tool: 'live.prayer', prayer: 'Maghrib', lang: 'ar' }],
    ['prayer times in dubai', { tool: 'live.prayer', all: true, city: 'dubai' }],
    ['مواقيت الصلاة', { tool: 'live.prayer', all: true, lang: 'ar' }],
    ['next prayer', { tool: 'live.prayer' }],
    ['morning brief', { tool: 'live.brief' }],
    ['say ayat al kursi', { tool: 'live.quran', reference: '2:255' }],
    ['recite surah al fatiha', { tool: 'live.quran', reference: '1' }],
    ['quran 2:255', { tool: 'live.quran', reference: '2:255' }],
    ['اقرأ آية الكرسي', { tool: 'live.quran', reference: '2:255', translate: false }],
    ['سورة ٢ آية ٢٥٥', { tool: 'live.quran', reference: '2:255' }],
    ['read me the headlines', { tool: 'live.headlines', topic: '' }],
    ['news about dubai', { tool: 'live.headlines', topic: 'dubai' }],
    ['space news', { tool: 'live.space_news' }],
    ['tell me a joke', { tool: 'live.joke' }],
    ['inspire me', { tool: 'live.quote' }],
    ['where am i', { tool: 'live.where_am_i' }],
    ['make a qr code for https://example.com', { tool: 'local.qr', text: 'https://example.com' }],
    ['set a timer for 5 minutes', { tool: 'local.timer', seconds: 300 }],
    ['timer 1 hour 30 minutes', { tool: 'local.timer', seconds: 5400 }],
    ['مؤقت ١٠ دقائق', { tool: 'local.timer', seconds: 600 }],
    ['wake me up at 6:30', { tool: 'local.alarm', hour: 6, minute: 30 }],
    ['set an alarm for 7 pm', { tool: 'local.alarm', hour: 19, minute: 0 }],
    ['take a note: call the bank on Sunday', { tool: 'local.note_add', text: 'call the bank on Sunday' }],
    ['read my notes', { tool: 'local.notes_read' }],
    ['open bluetooth settings', { tool: 'device.settings_panel', panel: 'bluetooth' }],
    ['turn on airplane mode', { tool: 'device.settings_panel', panel: 'airplane' }],
    ['افتح إعدادات البلوتوث', { tool: 'device.settings_panel', panel: 'bluetooth' }],
  ])('%s', (text, expected) => {
    const routed = call(text);
    const { tool, ...args } = expected as { tool: string } & Record<string, unknown>;
    expect(routed?.tool).toBe(tool);
    expect(routed?.arguments).toMatchObject(args);
    // Every routed tool exists and accepts the arguments the router built.
    const definition = toolRegistry.get(tool)!;
    expect(definition.schema.safeParse(routed!.arguments).success).toBe(true);
  });

  it.each([
    'tell me about how weather patterns affect climate change in the gulf region over decades',
    'I was thinking about the news yesterday and what it means',
    'open youtube',
    'what is 12 times 7',
  ])('leaves "%s" to its existing route or the brain', (text) => {
    expect(['live.weather', 'live.headlines', 'device.settings_panel']).not.toContain(call(text)?.tool);
  });

  it('keeps existing routes working', () => {
    expect(call("what's the time")?.tool).toBe('utility.time');
    expect(call('calculate 200 + 400')?.tool).toBe('utility.calculate');
    expect(call('open whatsapp')?.tool).toBe('phone.open_app');
  });
});

describe('durations and clock times', () => {
  it('parses spoken durations', () => {
    expect(parseDuration('5 minutes')).toBe(300);
    expect(parseDuration('two hours')).toBe(7200);
    expect(parseDuration('half an hour')).toBe(1800);
    expect(parseDuration('90 seconds')).toBe(90);
    expect(parseDuration('no numbers here')).toBeNull();
    expect(parseDuration('30 hours')).toBeNull();
    expect(describeDuration(5400, 'en')).toBe('1 hour 30 minutes');
    expect(describeDuration(600, 'ar')).toBe('10 دقيقة');
  });

  it('parses clock times', () => {
    expect(parseClockTime('12 am')).toEqual({ hour: 0, minute: 0 });
    expect(parseClockTime('٦ مساء')).toEqual({ hour: 18, minute: 0 });
    expect(parseClockTime('25:00')).toBeNull();
  });
});

describe('local QR', () => {
  it('encodes on the phone, UTF-8 included', () => {
    const qr = makeQr('https://example.com');
    expect(qr?.size).toBeGreaterThanOrEqual(21);
    expect(qr?.path).toMatch(/^M\d+ \d+h\d+v1h-\d+z/);
    expect(makeQr('مرحبا يا جارفيس')?.size).toBeGreaterThanOrEqual(21);
    expect(makeQr('')).toBeNull();
    expect(makeQr('x'.repeat(5000))).toBeNull();
  });
});

import { followUpCommand } from '@/lib/tools/liveRoutes';

describe('reminders and follow-ups', () => {
  it('remind me in … sets a labelled timer', () => {
    expect(call('remind me in 10 minutes to stretch')).toMatchObject({ tool: 'local.timer', arguments: { seconds: 600, label: 'stretch' } });
    expect(call('ذكرني بعد ٥ دقائق')).toMatchObject({ tool: 'local.timer', arguments: { seconds: 300 } });
  });

  it('a short follow-up stays on the last live tool', () => {
    const weather = { tool: 'live.weather' as const, city: 'Ajman' };
    expect(followUpCommand('and tomorrow?', weather)).toBe('weather in Ajman tomorrow');
    expect(call(followUpCommand('and tomorrow?', weather)!)).toMatchObject({ tool: 'live.weather', arguments: { city: 'ajman', day: 'tomorrow' } });
    expect(call(followUpCommand('what about Dubai', weather)!)).toMatchObject({ tool: 'live.weather', arguments: { city: 'dubai' } });
    expect(call(followUpCommand('وبكرة؟', weather)!)?.tool).toBe('live.weather');
    expect(call(followUpCommand('and tomorrow', { tool: 'live.prayer' })!)).toMatchObject({ tool: 'live.prayer', arguments: { all: true, tomorrow: true } });
    expect(followUpCommand('what about you', weather)).toBeNull();
    expect(followUpCommand('and tomorrow?', null)).toBeNull();
    expect(followUpCommand('tell me a story', weather)).toBeNull();
  });
});
