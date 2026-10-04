/**
 * Spoken durations and clock times → numbers, English and Arabic.
 * "set a timer for 5 minutes", "timer 1 hour 30 minutes", «مؤقت ١٠ دقائق»,
 * "wake me at 6:30", "alarm for 7 pm", «منبه الساعة ٦».
 */

const ARABIC_DIGITS = /[٠-٩]/g;
export function westernDigits(text: string): string {
  return text.replace(ARABIC_DIGITS, (d) => String(d.charCodeAt(0) - 0x0660));
}

const WORD_NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  fifteen: 15, twenty: 20, thirty: 30, forty: 40, 'forty five': 45, fifty: 50, sixty: 60, ninety: 90,
  half: 0.5, 'a half': 0.5, quarter: 0.25,
  واحد: 1, واحدة: 1, اثنين: 2, ثلاث: 3, ثلاثة: 3, أربع: 4, خمس: 5, خمسة: 5, عشر: 10, عشرة: 10, عشرين: 20, ثلاثين: 30, نص: 0.5, نصف: 0.5, ربع: 0.25,
};

const UNIT_SECONDS: [RegExp, number][] = [
  [/^(?:h|hr|hrs|hour|hours|ساعة|ساعات|ساعه)$/, 3600],
  [/^(?:m|min|mins|minute|minutes|دقيقة|دقائق|دقيقه|دقايق)$/, 60],
  [/^(?:s|sec|secs|second|seconds|ثانية|ثواني|ثانيه)$/, 1],
];

/** Total seconds in a spoken duration, or null when there is none. */
export function parseDuration(text: string): number | null {
  let clean = westernDigits(text.toLowerCase()).replace(/[،,]/g, ' ').replace(/\band\b|و(?=\d|\s)/g, ' ');
  let total = 0;
  let found = false;
  // "half an hour" before the general pass, which would read "an hour" as one hour.
  if (/half\s+an\s+hour|نص\s+ساع[ةه]|نصف\s+ساع[ةه]/u.test(clean)) {
    total = 1800;
    found = true;
    clean = clean.replace(/half\s+an\s+hour|نص\s+ساع[ةه]|نصف\s+ساع[ةه]/gu, ' ');
  }
  const re = /(\d+(?:\.\d+)?|forty five|a half|[a-z؀-ۿ]+)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s|ساعة|ساعات|ساعه|دقيقة|دقائق|دقيقه|دقايق|ثانية|ثواني|ثانيه)(?![a-z\u0600-\u06FF])/giu;
  for (const match of clean.matchAll(re)) {
    const raw = match[1]!;
    const amount = /^\d/.test(raw) ? Number(raw) : WORD_NUMBERS[raw];
    if (amount === undefined || !Number.isFinite(amount)) continue;
    const unit = UNIT_SECONDS.find(([pattern]) => pattern.test(match[2]!));
    if (!unit) continue;
    total += amount * unit[1];
    found = true;
  }
  // "an hour and a half"
  if (/and a half/.test(text.toLowerCase()) && found) {
    total += /hour/.test(text.toLowerCase()) ? 1800 : 30;
  }
  if (!found) return null;
  const seconds = Math.round(total);
  return seconds >= 1 && seconds <= 86_400 ? seconds : null;
}

/** "5 minutes", "1 hour 30 minutes", «١٠ دقائق» — for saying it back. */
export function describeDuration(seconds: number, lang: 'en' | 'ar'): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (lang === 'ar') {
    if (h) parts.push(`${h} ساعة`);
    if (m) parts.push(`${m} دقيقة`);
    if (s) parts.push(`${s} ثانية`);
    return parts.join(' و');
  }
  if (h) parts.push(`${h} hour${h === 1 ? '' : 's'}`);
  if (m) parts.push(`${m} minute${m === 1 ? '' : 's'}`);
  if (s) parts.push(`${s} second${s === 1 ? '' : 's'}`);
  return parts.join(' ');
}

/** "6:30", "7 pm", "18:05", «٦ مساء», «الساعة ٧ صباحا» → 24-hour clock. */
export function parseClockTime(text: string): { hour: number; minute: number } | null {
  const clean = westernDigits(text.toLowerCase());
  const match = /(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?|صباحا|صباحًا|الصبح|مساء|مساءً|مساءا|بالليل|العصر)?/u.exec(clean);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3] ?? '';
  if (/p|مساء|بالليل|العصر/.test(meridiem) && hour < 12) hour += 12;
  if (/a|صباح|الصبح/.test(meridiem) && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}
