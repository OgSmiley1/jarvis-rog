import type { JarvisToolCall } from './types';
import { createId } from '@/lib/utils/ids';
import { parseClockTime, parseDuration } from '@/lib/utils/durations';
import type { SettingsPanel } from './localTools';

/**
 * Deterministic routes for live data and local utilities. Matching is by
 * pattern, anchored at the start of the request, so a sentence that merely
 * mentions the weather in passing still goes to the brain. No model runs
 * here: these requests are answered straight from a tool.
 */

export interface LiveRoute {
  call: JarvisToolCall;
  successMessage: string;
}

const route = (tool: string, args: Record<string, unknown>): LiveRoute => ({
  call: { id: createId('tool'), tool, arguments: args },
  successMessage: 'Done.',
});

const hasArabic = (text: string) => /[؀-ۿ]/.test(text);

const TIME_WORDS_EN = /\b(?:right\s+now|now|today|tonight|tomorrow|this\s+(?:morning|afternoon|evening))\b/g;

/** "in Abu Dhabi", "for London" → the place, with time and unit words removed. */
function placeAfter(text: string, ar: boolean): string | undefined {
  if (ar) {
    const m = /(?:^|\s)(?:في|ب)\s*([^؟?.،,]+?)\s*(?:اليوم|الحين|الآن|بكرة|بكره|غدًا|غدا|باكر)?\s*[؟?.]*$/u.exec(text);
    const city = m?.[1]?.trim();
    return city && city.length > 1 ? city : undefined;
  }
  const cleaned = text.replace(/\bin\s+(?:celsius|fahrenheit)\b/g, '').replace(TIME_WORDS_EN, '').replace(/\s+/g, ' ').trim();
  const m = /\b(?:in|for|at)\s+([a-z][a-z .'-]{1,40}?)\s*$/.exec(cleaned);
  const city = m?.[1]?.trim();
  if (!city || /^(?:the\s+)?(?:morning|evening|afternoon|week|weekend)$/.test(city)) return undefined;
  return city;
}

const PRAYER_WORDS: Record<string, string> = {
  fajr: 'Fajr', fajer: 'Fajr', sunrise: 'Sunrise', shuruq: 'Sunrise', dhuhr: 'Dhuhr', zuhr: 'Dhuhr', duhr: 'Dhuhr', zohr: 'Dhuhr',
  asr: 'Asr', maghrib: 'Maghrib', magrib: 'Maghrib', isha: 'Isha', esha: 'Isha',
  الفجر: 'Fajr', الشروق: 'Sunrise', الظهر: 'Dhuhr', العصر: 'Asr', المغرب: 'Maghrib', العشاء: 'Isha',
};

const SURAHS: Record<string, string> = {
  'ayat al kursi': '2:255', 'ayatul kursi': '2:255', 'ayat ul kursi': '2:255', 'ayat alkursi': '2:255', 'the throne verse': '2:255',
  'al fatiha': '1', fatiha: '1', 'al fatihah': '1', fatihah: '1', 'al ikhlas': '112', ikhlas: '112', 'al falaq': '113', falaq: '113',
  'an nas': '114', 'al nas': '114', nas: '114', 'al asr': '103', 'al kawthar': '108', kawthar: '108', kauthar: '108',
  'آية الكرسي': '2:255', 'ايه الكرسي': '2:255', 'اية الكرسي': '2:255', الفاتحة: '1', الفاتحه: '1', الإخلاص: '112', الاخلاص: '112',
  الفلق: '113', الناس: '114', الكوثر: '108',
};

const PANELS: [RegExp, SettingsPanel][] = [
  [/wi-?fi|واي\s*فاي|الواي/u, 'wifi'],
  [/bluetooth|البلوتوث|بلوتوث/u, 'bluetooth'],
  [/battery|البطارية|البطاريه/u, 'battery'],
  [/display|brightness|screen|الشاشة|السطوع/u, 'display'],
  [/sound|volume|الصوت/u, 'sound'],
  [/location|gps|الموقع/u, 'location'],
  [/airplane|flight\s+mode|الطيران/u, 'airplane'],
  [/notification|الإشعارات|الاشعارات/u, 'notifications'],
  [/mobile\s+data|data\s+usage|البيانات/u, 'data'],
];

export function routeLive(trimmed: string, normalized: string): LiveRoute | null {
  const ar = hasArabic(trimmed);
  const lang = ar ? 'ar' : 'en';
  const tomorrow = /\btomorrow\b|بكرة|بكره|غدًا|غدا|باكر/u.test(trimmed.toLowerCase());
  const n = normalized.replace(/[?!.]+$/, '').trim();

  // ── Weather + prayer together ─────────────────────────────────────────
  if (/^(?:(?:morning|daily)\s+brief(?:ing)?|weather\s+and\s+(?:the\s+)?(?:next\s+)?prayer(?:\s+times?)?)$/.test(n) || /^(?:الطقس|الجو)\s+و\s*(?:الصلاة|المواقيت)/u.test(trimmed)) {
    return route('live.brief', { lang });
  }

  // ── Prayer ────────────────────────────────────────────────────────────
  const prayerEn = /^(?:when(?:'s|\s+is)|what\s+time\s+is|time\s+(?:for|of)|what\s+time(?:'s|\s+is)?)\s+(?:the\s+)?(fajr|fajer|sunrise|shuruq|dhuhr|zuhr|duhr|zohr|asr|maghrib|magrib|isha|esha)(?:\s+prayer)?\b/.exec(n);
  const prayerAr = /^(?:متى|كم\s+الساع[ةه]|وقت|موعد)\s+(?:أذان\s+|اذان\s+|صلاة\s+|صلا[ةه]\s+)?(الفجر|الشروق|الظهر|العصر|المغرب|العشاء)/u.exec(trimmed);
  const prayerWord = prayerEn?.[1] ?? prayerAr?.[1];
  if (prayerWord) return route('live.prayer', { prayer: PRAYER_WORDS[prayerWord], city: placeAfter(ar ? trimmed : n, ar), tomorrow, lang });
  if (/^(?:(?:what\s+are\s+)?(?:the\s+|today'?s\s+|tomorrow'?s\s+)?prayer\s+times?|salah\s+times?|namaz\s+times?)\b/.test(n) || /^(?:مواقيت|اوقات|أوقات)\s+الصلا[ةه]/u.test(trimmed)) {
    return route('live.prayer', { all: true, city: placeAfter(ar ? trimmed : n, ar), tomorrow, lang });
  }
  if (/^(?:when(?:'s|\s+is)\s+)?(?:the\s+)?next\s+prayer\b/.test(n) || /^(?:متى\s+)?الصلا[ةه]\s+(?:القادم[ةه]|الجاي[ةه])/u.test(trimmed)) {
    return route('live.prayer', { city: placeAfter(ar ? trimmed : n, ar), lang });
  }

  // ── Weather ───────────────────────────────────────────────────────────
  const weatherEn =
    /^(?:(?:what(?:'s|\s+is)|how(?:'s|\s+is)|tell\s+me|give\s+me|check|get)\s+)?(?:the\s+)?(?:weather|forecast|temperature)\b/.test(n) ||
    /^how\s+(?:hot|cold|warm)\s+is\s+it\b/.test(n) ||
    /^(?:is\s+it|will\s+it)\s+(?:going\s+to\s+)?rain/.test(n);
  const weatherAr = /^(?:كيف|ايش|إيش|وش|شو|كم|ما|ماهي|ما\s+هي)?\s*(?:الطقس|الجو|درج[ةه]\s+الحرار[ةه]|حال[ةه]\s+الجو)/u.test(trimmed) || /^(?:بتمطر|راح\s+تمطر|هل\s+ستمطر)/u.test(trimmed);
  if (weatherEn || weatherAr) {
    return route('live.weather', {
      city: placeAfter(ar ? trimmed : n, ar),
      day: tomorrow ? 'tomorrow' : 'today',
      ...(/\bfahrenheit\b/.test(n) ? { unit: 'fahrenheit' } : /\bcelsius\b/.test(n) ? { unit: 'celsius' } : {}),
      lang,
    });
  }

  // ── Quran ─────────────────────────────────────────────────────────────
  const quranRef =
    /^(?:(?:read|recite|say|play)\s+)?(?:quran\s+|surah?\s+)(\d{1,3})\s*(?::|verse|ayah|aya)\s*(\d{1,3})$/.exec(n) ??
    /^(?:اقرأ\s+|اقرا\s+)?(?:سورة|سوره)\s+(\d{1,3}|[٠-٩]{1,3})\s+(?:آية|اية|ايه)\s+(\d{1,3}|[٠-٩]{1,3})$/u.exec(trimmed);
  if (quranRef) {
    const digits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
    return route('live.quran', { reference: `${Number(digits(quranRef[1]!))}:${Number(digits(quranRef[2]!))}`, translate: !ar, lang });
  }
  const recite = /^(?:(?:please\s+)?(?:read|recite|say|play)\s+(?:me\s+)?)?(?:surah?\s+|surat\s+)?(.+)$/.exec(n);
  const recitedAr = /^(?:اقرأ|اقرا|اقرأ\s+لي|قول|اتل|اتلُ)?\s*(?:سورة\s+|سوره\s+)?(.+?)[؟?.]*$/u.exec(trimmed);
  const named = ar ? SURAHS[recitedAr?.[1]?.trim() ?? ''] : SURAHS[recite?.[1]?.replace(/-/g, ' ').trim() ?? ''];
  if (named && (ar || /^(?:(?:please\s+)?(?:read|recite|say|play)\b|surah?\b|ayat)/.test(n))) {
    return route('live.quran', { reference: named, translate: !ar, lang });
  }

  // ── News ──────────────────────────────────────────────────────────────
  if (/^(?:(?:read|tell|give)\s+(?:me\s+)?)?(?:the\s+)?(?:latest\s+)?space\s+news$/.test(n) || /^أخبار\s+الفضاء$/u.test(trimmed)) {
    return route('live.space_news', { lang });
  }
  const news = /^(?:(?:read|tell|give|what(?:'s|\s+is|\s+are))\s+(?:me\s+)?)?(?:the\s+)?(?:latest\s+|top\s+)?(?:news|headlines)(?:\s+(?:about|on|for)\s+(.+))?$/.exec(n);
  const newsAr = /^(?:(?:اقرأ|اقرا|وش|ايش|ما)\s+)?(?:آخر\s+|اخر\s+)?(?:الأخبار|الاخبار|العناوين)(?:\s+عن\s+(.+))?$/u.exec(trimmed);
  if (news || newsAr) return route('live.headlines', { topic: (news?.[1] ?? newsAr?.[1] ?? '').trim(), lang });

  // ── Personality ───────────────────────────────────────────────────────
  if (/^(?:tell\s+(?:me\s+)?a\s+joke|(?:a\s+)?joke|make\s+me\s+laugh|say\s+something\s+funny)$/.test(n) || /^(?:قول|قل|احكي)?\s*(?:لي\s+)?نكت[ةه]$/u.test(trimmed)) {
    return route('live.joke', { lang });
  }
  if (/^(?:inspire\s+me|motivate\s+me|(?:give\s+me\s+)?(?:a\s+)?(?:quote|motivation)|say\s+something\s+inspiring)$/.test(n) || /^(?:حفزني|حمسني|كلم[ةه]\s+تحفيزي[ةه]|اعطني\s+حكم[ةه])$/u.test(trimmed)) {
    return route('live.quote', { lang });
  }
  if (/^(?:where\s+am\s+i|what\s+city\s+am\s+i\s+in|my\s+location)$/.test(n) || /^(?:وين|أين|اين)\s+(?:أنا|انا)$/u.test(trimmed)) {
    return route('live.where_am_i', { lang });
  }

  // ── QR ────────────────────────────────────────────────────────────────
  const qr =
    /^(?:make|create|generate|show)\s+(?:me\s+)?(?:a\s+)?qr(?:\s+code)?\s+(?:for|of|with)\s+(.+)$/i.exec(trimmed) ??
    /^qr(?:\s+code)?\s+(?:for\s+)?(.+)$/i.exec(trimmed) ??
    /^(?:سو|سوي|اعمل|أنشئ|انشئ)\s+(?:لي\s+)?(?:باركود|رمز\s+qr|كود\s+qr|qr)\s+(?:ل|لـ|عن)?\s*(.+)$/iu.exec(trimmed);
  if (qr?.[1]) return route('local.qr', { text: qr[1].trim(), lang });

  // ── Timers and alarms ─────────────────────────────────────────────────
  if (/^(?:show|open)\s+(?:my\s+)?timers?$/.test(n) || /^(?:افتح|اعرض)\s+المؤقتات$/u.test(trimmed)) return route('local.show_timers', { lang });
  if (/\btimer\b|مؤقت|تايمر/u.test(n)) {
    const seconds = parseDuration(trimmed);
    if (seconds) return route('local.timer', { seconds, lang });
  }
  const alarm = /^(?:set\s+(?:an?\s+)?alarm\s+(?:for|at)|alarm\s+(?:for|at)|wake\s+me(?:\s+up)?\s+at)\s+(.+)$/.exec(n) ?? /^(?:منبه|منبّه|صحني|صحيني|اضبط\s+منبه)\s+(?:الساع[ةه]\s+)?(.+)$/u.exec(trimmed);
  if (alarm?.[1]) {
    const at = parseClockTime(alarm[1]);
    if (at) return route('local.alarm', { ...at, lang });
  }

  // ── Notes ─────────────────────────────────────────────────────────────
  if (/^(?:read\s+(?:me\s+)?my\s+notes|what\s+are\s+my\s+notes|my\s+notes)$/.test(n) || /^(?:ملاحظاتي|اقرأ\s+ملاحظاتي|اقرا\s+ملاحظاتي)$/u.test(trimmed)) {
    return route('local.notes_read', { lang });
  }
  const note = /^(?:take\s+a\s+note|make\s+a\s+note|add\s+a\s+note|note(?:\s+that)?)[:,]?\s+(.+)$/i.exec(trimmed) ?? /^(?:سجل|سجّل|اكتب)\s+(?:ملاحظ[ةه])[:،]?\s+(.+)$/u.exec(trimmed) ?? /^ملاحظ[ةه][:،]\s*(.+)$/u.exec(trimmed);
  if (note?.[1]) return route('local.note_add', { text: note[1].trim(), lang });

  // ── Settings panels (the switch stays the owner's) ────────────────────
  const settingsAsk = /^(?:open\s+(?:the\s+)?(.+?)\s+settings|turn\s+(?:on|off)\s+(?:the\s+)?(.+?)|(.+?)\s+settings)$/.exec(n) ?? /^(?:افتح\s+)?(?:إعدادات|اعدادات)\s+(.+)$/u.exec(trimmed) ?? /^(?:شغل|طفي|اطفئ|شغّل)\s+(.+)$/u.exec(trimmed);
  const target = settingsAsk?.slice(1).find(Boolean);
  if (target) {
    const panel = PANELS.find(([pattern]) => pattern.test(target));
    if (panel) return route('device.settings_panel', { panel: panel[1], lang });
  }

  return null;
}
