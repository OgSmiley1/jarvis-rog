/**
 * Turns what the phone returns (contacts, messages, calls, events, apps) into
 * decisions and short spoken sentences. Pure, so every branch is tested.
 */

export type Lang = 'en' | 'ar';

export interface Contact {
  name: string;
  number: string;
  type?: string;
}

export type ContactPick =
  | { kind: 'one'; contact: Contact }
  | { kind: 'many'; names: string[] }
  | { kind: 'none' };

const digits = (value: string) => value.replace(/\D/g, '').slice(-9);

export function looksLikeNumber(text: string): boolean {
  return /^[+0-9 ()-]{3,40}$/.test(text.trim()) && /\d{3,}/.test(text.replace(/\D/g, ''));
}

/**
 * One contact when the name is unambiguous: an exact name match wins, and
 * several numbers for the same person count as one (mobile first).
 */
export function pickContact(query: string, contacts: Contact[]): ContactPick {
  if (contacts.length === 0) return { kind: 'none' };
  const wanted = query.trim().toLowerCase();
  const exact = contacts.filter((contact) => contact.name.trim().toLowerCase() === wanted);
  const pool = exact.length > 0 ? exact : contacts;
  const names = [...new Set(pool.map((contact) => contact.name))];
  if (names.length > 1) return { kind: 'many', names: names.slice(0, 4) };
  const mobile = pool.find((contact) => /mobile|cell|جوال|محمول/i.test(contact.type ?? ''));
  const unique = new Set(pool.map((contact) => digits(contact.number)));
  return { kind: 'one', contact: unique.size > 1 && mobile ? mobile : pool[0]! };
}

export interface InstalledApp {
  label: string;
  package: string;
}

const clean = (value: string) =>
  value
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/\s+app$/, '')
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .trim();

/** Exact label, then alias, then label starts-with, then contains. */
export function matchApp(name: string, apps: InstalledApp[], aliases: Record<string, string> = {}): InstalledApp | null {
  const wanted = clean(name);
  if (!wanted) return null;
  const byLabel = (test: (label: string) => boolean) => apps.find((app) => test(clean(app.label)));
  const aliasPackage = aliases[wanted];
  return (
    byLabel((label) => label === wanted) ??
    (aliasPackage ? apps.find((app) => app.package === aliasPackage) : undefined) ??
    byLabel((label) => label.startsWith(wanted)) ??
    (wanted.length >= 3 ? byLabel((label) => label.includes(wanted)) : undefined) ??
    null
  );
}

export function clockTime(ms: number, lang: Lang): string {
  const date = new Date(ms);
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  if (lang === 'ar') return `${twelve}:${minutes} ${hours < 12 ? 'صباحًا' : 'مساءً'}`;
  return `${twelve}:${minutes} ${hours < 12 ? 'AM' : 'PM'}`;
}

function when(ms: number, now: number, lang: Lang): string {
  const day = (value: number) => new Date(value).toDateString();
  if (day(ms) === day(now)) return clockTime(ms, lang);
  if (day(ms) === day(now - 86_400_000)) return lang === 'ar' ? `أمس ${clockTime(ms, lang)}` : `yesterday at ${clockTime(ms, lang)}`;
  const date = new Date(ms);
  return lang === 'ar' ? `${date.getDate()}/${date.getMonth() + 1}` : `on ${date.getDate()}/${date.getMonth() + 1}`;
}

export interface Message {
  from: string;
  body: string;
  date: number;
  read: boolean;
}

export function describeMessages(messages: Message[], now: number, lang: Lang): string {
  if (messages.length === 0) return lang === 'ar' ? 'لا توجد رسائل.' : 'You have no messages.';
  const unread = messages.filter((message) => !message.read);
  const shown = (unread.length > 0 ? unread : messages).slice(0, 3);
  const lead =
    unread.length > 0
      ? lang === 'ar'
        ? `عندك ${unread.length} رسائل غير مقروءة.`
        : `You have ${unread.length} unread ${unread.length === 1 ? 'message' : 'messages'}.`
      : lang === 'ar'
        ? 'لا جديد. آخر الرسائل:'
        : 'Nothing unread. Your latest:';
  const lines = shown.map((message) => {
    const body = message.body.length > 140 ? `${message.body.slice(0, 137)}…` : message.body;
    return lang === 'ar' ? `من ${message.from}، ${when(message.date, now, lang)}: ${body}` : `From ${message.from}, ${when(message.date, now, lang)}: ${body}`;
  });
  return [lead, ...lines].join('\n');
}

export interface CallEntry {
  name: string;
  number: string;
  kind: 'incoming' | 'outgoing' | 'missed' | 'rejected' | 'blocked' | 'other';
  date: number;
  seconds: number;
}

export function describeCalls(calls: CallEntry[], now: number, lang: Lang, missedOnly = false): string {
  const list = missedOnly ? calls.filter((call) => call.kind === 'missed') : calls;
  if (list.length === 0) {
    if (missedOnly) return lang === 'ar' ? 'لا توجد مكالمات فائتة.' : 'No missed calls.';
    return lang === 'ar' ? 'سجل المكالمات فارغ.' : 'Your call log is empty.';
  }
  const kindWord = (kind: CallEntry['kind']) =>
    lang === 'ar'
      ? ({ incoming: 'واردة', outgoing: 'صادرة', missed: 'فائتة', rejected: 'مرفوضة', blocked: 'محظورة', other: '' } as const)[kind]
      : ({ incoming: 'incoming', outgoing: 'outgoing', missed: 'missed', rejected: 'declined', blocked: 'blocked', other: '' } as const)[kind];
  const lines = list.slice(0, 4).map((call) =>
    lang === 'ar'
      ? `${call.name} — ${kindWord(call.kind)}، ${when(call.date, now, lang)}`
      : `${call.name}, ${kindWord(call.kind)}, ${when(call.date, now, lang)}`,
  );
  const lead = missedOnly
    ? lang === 'ar' ? `${list.length} مكالمات فائتة:` : `${list.length} missed ${list.length === 1 ? 'call' : 'calls'}:`
    : lang === 'ar' ? 'آخر المكالمات:' : 'Recent calls:';
  return [lead, ...lines].join('\n');
}

export type CalendarSpan = 'today' | 'tomorrow' | 'week';

export function calendarRange(span: CalendarSpan, now: number): { start: number; end: number } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const dayMs = 86_400_000;
  if (span === 'today') return { start: now, end: start.getTime() + dayMs };
  if (span === 'tomorrow') return { start: start.getTime() + dayMs, end: start.getTime() + 2 * dayMs };
  return { start: now, end: start.getTime() + 7 * dayMs };
}

export interface CalendarEvent {
  title: string;
  begin: number;
  end: number;
  allDay: boolean;
  location?: string | null;
}

export function describeEvents(events: CalendarEvent[], span: CalendarSpan, now: number, lang: Lang): string {
  const label =
    lang === 'ar'
      ? { today: 'اليوم', tomorrow: 'غدًا', week: 'هذا الأسبوع' }[span]
      : { today: 'today', tomorrow: 'tomorrow', week: 'this week' }[span];
  if (events.length === 0) return lang === 'ar' ? `لا مواعيد ${label}.` : `Nothing on your calendar ${label}.`;
  const lines = events.slice(0, 5).map((event) => {
    const time = event.allDay ? (lang === 'ar' ? 'طوال اليوم' : 'all day') : span === 'week' ? when(event.begin, now, lang) : clockTime(event.begin, lang);
    const place = event.location ? (lang === 'ar' ? ` في ${event.location}` : ` at ${event.location}`) : '';
    return `${event.title}, ${time}${place}`;
  });
  const lead =
    lang === 'ar'
      ? `${events.length} مواعيد ${label}:`
      : `${events.length} ${events.length === 1 ? 'event' : 'events'} ${label}:`;
  return [lead, ...lines].join('\n');
}

export function describeBattery(level: number | null, charging: boolean, lang: Lang): string {
  if (level === null) return lang === 'ar' ? 'لا أستطيع قراءة البطارية.' : 'I cannot read the battery.';
  const percent = Math.round(level * 100);
  if (lang === 'ar') return `البطارية ${percent}%${charging ? '، والجهاز يشحن.' : '.'}`;
  return `Battery is at ${percent} percent${charging ? ', and charging.' : '.'}`;
}

/** "PERMISSION_DENIED:READ_SMS" → the sentence that tells the owner what to allow. */
export function describePermissionError(message: string, lang: Lang): string | null {
  const match = /PERMISSION_DENIED:([A-Z_]+)/.exec(message);
  if (!match) return null;
  const what: Record<string, [string, string]> = {
    READ_CONTACTS: ['your contacts', 'جهات الاتصال'],
    READ_SMS: ['your messages', 'الرسائل'],
    READ_CALL_LOG: ['your call log', 'سجل المكالمات'],
    READ_CALENDAR: ['your calendar', 'التقويم'],
  };
  const [en, ar] = what[match[1]!] ?? [match[1]!, match[1]!];
  return lang === 'ar'
    ? `أحتاج إذنًا للوصول إلى ${ar}. افتح الإعدادات ← الوصول إلى الهاتف واضغط سماح.`
    : `I need permission to read ${en}. Open Settings → Phone access and tap Allow.`;
}
