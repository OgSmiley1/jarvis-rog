import { describe, expect, it } from 'vitest';
import { routeDeterministicTool } from '@/lib/tools/deterministicRouter';
import {
  calendarRange,
  describeBattery,
  describeCalls,
  describeEvents,
  describeMessages,
  describePermissionError,
  matchApp,
  pickContact,
} from '@/lib/device/phoneSpeech';

const route = (text: string) => {
  const found = routeDeterministicTool(text);
  return found ? { tool: found.call.tool, args: found.call.arguments } : null;
};

describe('phone voice commands', () => {
  it.each([
    ['Jarvis read my messages', 'phone.read_messages'],
    ['any new messages?', 'phone.read_messages'],
    ['اقرأ رسائلي', 'phone.read_messages'],
    ['who called me', 'phone.recent_calls'],
    ['show me my call log', 'phone.recent_calls'],
    ['مين اتصل علي', 'phone.recent_calls'],
    ["what's on my calendar today", 'phone.calendar'],
    ['what do I have tomorrow', 'phone.calendar'],
    ['مواعيدي بكرة', 'phone.calendar'],
    ['how much battery do I have', 'phone.battery'],
    ['كم البطارية', 'phone.battery'],
    ['search for best shawarma in Ajman', 'phone.web_search'],
    ['ابحث عن مطعم', 'phone.web_search'],
  ])('%s → %s', (text, tool) => {
    expect(route(text)?.tool).toBe(tool);
  });

  it('separates missed calls from all calls', () => {
    expect(route('any missed calls')?.args).toEqual({ missed: true, lang: 'en' });
    expect(route('who called me')?.args).toEqual({ missed: false, lang: 'en' });
  });

  it('reads the calendar span', () => {
    expect(route('what do I have tomorrow')?.args).toEqual({ span: 'tomorrow', lang: 'en' });
    expect(route('show my schedule this week')?.args).toEqual({ span: 'week', lang: 'en' });
    expect(route('مواعيدي بكرة')?.args).toEqual({ span: 'tomorrow', lang: 'ar' });
  });

  it('calls a contact by name, in both languages', () => {
    expect(route('Jarvis call Mom')).toEqual({ tool: 'phone.call', args: { who: 'Mom', lang: 'en' } });
    expect(route('اتصل على أحمد')).toEqual({ tool: 'phone.call', args: { who: 'أحمد', lang: 'ar' } });
  });

  it('splits who from what when texting', () => {
    expect(route('text Ahmed saying I am on my way')).toEqual({
      tool: 'phone.text',
      args: { who: 'Ahmed', body: 'I am on my way', lang: 'en' },
    });
    expect(route('send a message to Sara Ali')).toEqual({ tool: 'phone.text', args: { who: 'Sara Ali', lang: 'en' } });
    expect(route('ارسل رسالة إلى أحمد وقل أنا جاي')).toEqual({
      tool: 'phone.text',
      args: { who: 'أحمد', body: 'أنا جاي', lang: 'ar' },
    });
  });

  it('keeps the older direct commands where they were', () => {
    expect(route('open messages')?.tool).toBe('device.compose_sms');
    expect(route('open camera')?.tool).toBe('device.open_camera');
    expect(route('open https://example.com')?.tool).toBe('device.open_url');
  });
});

describe('pickContact', () => {
  const ahmedMobile = { name: 'Ahmed Ali', number: '+971 50 111 2222', type: 'Mobile' };
  const ahmedWork = { name: 'Ahmed Ali', number: '04 555 6666', type: 'Work' };

  it('prefers the mobile number when one person has several', () => {
    expect(pickContact('ahmed ali', [ahmedWork, ahmedMobile])).toEqual({ kind: 'one', contact: ahmedMobile });
  });

  it('asks for the full name when several people match', () => {
    const pick = pickContact('ahmed', [ahmedMobile, { name: 'Ahmed Saeed', number: '050 333 4444' }]);
    expect(pick).toEqual({ kind: 'many', names: ['Ahmed Ali', 'Ahmed Saeed'] });
  });

  it('an exact name wins over partial matches', () => {
    const pick = pickContact('mom', [{ name: 'Mom', number: '1' }, { name: 'Mommy Shop', number: '2' }]);
    expect(pick).toMatchObject({ kind: 'one', contact: { name: 'Mom' } });
  });

  it('reports no match', () => {
    expect(pickContact('zed', [])).toEqual({ kind: 'none' });
  });
});

describe('matchApp', () => {
  const apps = [
    { label: 'WhatsApp', package: 'com.whatsapp' },
    { label: 'YouTube Music', package: 'com.google.android.apps.youtube.music' },
    { label: 'YouTube', package: 'com.google.android.youtube' },
    { label: 'Armoury Crate', package: 'com.asus.gamecenter' },
  ];

  it('an exact label beats a longer one', () => {
    expect(matchApp('YouTube', apps)?.package).toBe('com.google.android.youtube');
  });

  it('uses aliases for what people actually say', () => {
    expect(matchApp('واتساب', apps, { 'واتساب': 'com.whatsapp' })?.package).toBe('com.whatsapp');
  });

  it('matches the start of a label', () => {
    expect(matchApp('armoury', apps)?.package).toBe('com.asus.gamecenter');
  });

  it('returns null rather than a wrong app', () => {
    expect(matchApp('pod bay doors', apps)).toBeNull();
  });
});

describe('spoken summaries', () => {
  const now = new Date(2026, 8, 24, 18, 0).getTime();

  it('leads with unread messages', () => {
    const text = describeMessages(
      [
        { from: 'Sara', body: 'Call me', date: now - 60_000, read: false },
        { from: 'Bank', body: 'Statement ready', date: now - 3_600_000, read: true },
      ],
      now,
      'en',
    );
    expect(text).toContain('You have 1 unread message.');
    expect(text).toContain('From Sara');
    expect(text).not.toContain('Bank');
  });

  it('counts missed calls', () => {
    const text = describeCalls(
      [
        { name: 'Mom', number: '1', kind: 'missed', date: now - 60_000, seconds: 0 },
        { name: 'Ali', number: '2', kind: 'incoming', date: now - 120_000, seconds: 30 },
      ],
      now,
      'en',
      true,
    );
    expect(text).toContain('1 missed call:');
    expect(text).toContain('Mom');
    expect(text).not.toContain('Ali');
  });

  it('says an empty day plainly', () => {
    expect(describeEvents([], 'tomorrow', now, 'en')).toBe('Nothing on your calendar tomorrow.');
  });

  it('lists events with times', () => {
    const begin = new Date(2026, 8, 24, 19, 30).getTime();
    expect(describeEvents([{ title: 'Dinner', begin, end: begin + 3_600_000, allDay: false }], 'today', now, 'en')).toContain(
      'Dinner, 7:30 PM',
    );
  });

  it('tomorrow starts at midnight', () => {
    const { start } = calendarRange('tomorrow', now);
    expect(new Date(start).getHours()).toBe(0);
    expect(new Date(start).getDate()).toBe(25);
  });

  it('battery', () => {
    expect(describeBattery(0.42, true, 'en')).toBe('Battery is at 42 percent, and charging.');
  });

  it('turns a missing permission into what to tap', () => {
    expect(describePermissionError('PERMISSION_DENIED:READ_SMS', 'en')).toContain('your messages');
    expect(describePermissionError('something else', 'en')).toBeNull();
  });
});
