import type { Headline, LiveResult, PrayerSchedule, Prayer, QuranPassage, WeatherReport } from './freeApis';

/**
 * Structured live data → the sentence JARVIS says. No language model: these
 * answers are formatted directly from validated fields, so they are fast,
 * exact and cannot hallucinate. Short by default; the numbers the owner asked
 * for come first.
 */

type Lang = 'en' | 'ar';

/** WMO weather interpretation codes (Open-Meteo docs), in both languages. */
const WMO: Record<number, [string, string]> = {
  0: ['clear sky', 'سماء صافية'],
  1: ['mainly clear', 'صافٍ غالبًا'],
  2: ['partly cloudy', 'غائم جزئيًا'],
  3: ['overcast', 'غائم'],
  45: ['fog', 'ضباب'],
  48: ['freezing fog', 'ضباب متجمد'],
  51: ['light drizzle', 'رذاذ خفيف'],
  53: ['drizzle', 'رذاذ'],
  55: ['heavy drizzle', 'رذاذ كثيف'],
  61: ['light rain', 'مطر خفيف'],
  63: ['rain', 'مطر'],
  65: ['heavy rain', 'مطر غزير'],
  71: ['light snow', 'ثلج خفيف'],
  73: ['snow', 'ثلج'],
  75: ['heavy snow', 'ثلج كثيف'],
  80: ['rain showers', 'زخات مطر'],
  81: ['heavy showers', 'زخات قوية'],
  82: ['violent showers', 'زخات عنيفة'],
  95: ['thunderstorms', 'عواصف رعدية'],
  96: ['thunderstorms with hail', 'عواصف رعدية مع برد'],
  99: ['thunderstorms with heavy hail', 'عواصف رعدية مع برد كثيف'],
};

export function describeWeatherCode(code: number, lang: Lang): string {
  const pair = WMO[code];
  if (!pair) return lang === 'ar' ? 'طقس غير معروف' : 'unknown conditions';
  return lang === 'ar' ? pair[1] : pair[0];
}

const deg = (value: number, unit: WeatherReport['unit'], lang: Lang) =>
  `${Math.round(value)}${lang === 'ar' ? ' درجة' : unit === 'fahrenheit' ? '°F' : ' degrees'}`;

/** "12 minutes old" — said whenever an answer came from the cache because the network failed. */
export function describeAge(ageMs: number, lang: Lang): string {
  const minutes = Math.max(1, Math.round(ageMs / 60_000));
  if (minutes < 90) return lang === 'ar' ? `قبل ${minutes} دقيقة` : `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  return lang === 'ar' ? `قبل ${hours} ساعة` : `${hours} hours ago`;
}

function staleNote(result: { stale: boolean; ageMs: number }, lang: Lang): string {
  if (!result.stale) return '';
  return lang === 'ar'
    ? ` (آخر تحديث ${describeAge(result.ageMs, lang)} — لا يوجد اتصال الآن)`
    : ` (last updated ${describeAge(result.ageMs, lang)} — I'm offline right now)`;
}

export function weatherSentence(result: Extract<LiveResult<WeatherReport>, { ok: true }>, day: 'today' | 'tomorrow', lang: Lang): string {
  const w = result.data;
  const city = lang === 'ar' ? w.cityAr : w.city;
  if (day === 'tomorrow') {
    const t = w.days[1];
    if (!t) return lang === 'ar' ? 'لا توجد توقعات للغد.' : "I don't have tomorrow's forecast.";
    const rain = t.rainChance !== undefined && t.rainChance >= 20
      ? lang === 'ar' ? `، واحتمال المطر ${t.rainChance}٪` : `, ${t.rainChance}% chance of rain`
      : '';
    return lang === 'ar'
      ? `غدًا في ${city}: ${describeWeatherCode(t.code, lang)}، العظمى ${deg(t.max, w.unit, lang)} والصغرى ${deg(t.min, w.unit, lang)}${rain}.${staleNote(result, lang)}`
      : `Tomorrow in ${city}: ${describeWeatherCode(t.code, lang)}, high of ${deg(t.max, w.unit, lang)}, low of ${deg(t.min, w.unit, lang)}${rain}.${staleNote(result, lang)}`;
  }
  const today = w.days[0];
  const feels = w.now.feelsLike !== undefined && Math.abs(w.now.feelsLike - w.now.temperature) >= 2
    ? lang === 'ar' ? `، وتُحسّ ${deg(w.now.feelsLike, w.unit, lang)}` : `, feels like ${deg(w.now.feelsLike, w.unit, lang)}`
    : '';
  const range = today
    ? lang === 'ar' ? ` العظمى اليوم ${deg(today.max, w.unit, lang)}.` : ` Today's high is ${deg(today.max, w.unit, lang)}.`
    : '';
  return lang === 'ar'
    ? `في ${city} الآن ${deg(w.now.temperature, w.unit, lang)}، ${describeWeatherCode(w.now.code, lang)}${feels}.${range}${staleNote(result, lang)}`
    : `It's ${deg(w.now.temperature, w.unit, lang)} in ${city}, ${describeWeatherCode(w.now.code, lang)}${feels}.${range}${staleNote(result, lang)}`;
}

const PRAYER_AR: Record<Prayer, string> = { Fajr: 'الفجر', Sunrise: 'الشروق', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء' };

/** "18:05" → "6:05 PM" / "6:05 مساءً". */
export function speakableTime(hhmm: string, lang: Lang): string {
  const h = Number(hhmm.slice(0, 2));
  const m = hhmm.slice(3, 5);
  const twelve = h % 12 === 0 ? 12 : h % 12;
  if (lang === 'ar') return `${twelve}:${m} ${h < 12 ? 'صباحًا' : 'مساءً'}`;
  return `${twelve}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

export function prayerName(prayer: Prayer, lang: Lang): string {
  return lang === 'ar' ? PRAYER_AR[prayer] : prayer;
}

export function prayerSentence(
  result: Extract<LiveResult<PrayerSchedule>, { ok: true }>,
  ask: { prayer?: Prayer; next?: { prayer: Prayer; time: string } | null; all?: boolean; tomorrow?: boolean },
  lang: Lang,
): string {
  const s = result.data;
  const city = lang === 'ar' ? s.cityAr : s.city;
  const when = ask.tomorrow ? (lang === 'ar' ? 'غدًا' : 'tomorrow') : lang === 'ar' ? 'اليوم' : 'today';
  if (ask.prayer) {
    return lang === 'ar'
      ? `${prayerName(ask.prayer, lang)} ${when} في ${city} الساعة ${speakableTime(s.times[ask.prayer], lang)}.`
      : `${ask.prayer} ${when} in ${city} is at ${speakableTime(s.times[ask.prayer], lang)}.`;
  }
  if (ask.all) {
    const list = (['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as Prayer[])
      .map((p) => `${prayerName(p, lang)} ${speakableTime(s.times[p], lang)}`)
      .join(lang === 'ar' ? '، ' : ', ');
    return lang === 'ar' ? `مواقيت الصلاة ${when} في ${city}: ${list}.` : `Prayer times ${when} in ${city}: ${list}.`;
  }
  if (ask.next) {
    return lang === 'ar'
      ? `الصلاة القادمة ${prayerName(ask.next.prayer, lang)} الساعة ${speakableTime(ask.next.time, lang)}.`
      : `Next is ${ask.next.prayer}, at ${speakableTime(ask.next.time, lang)}.`;
  }
  return lang === 'ar' ? 'انتهت صلوات اليوم. الفجر غدًا.' : "Today's prayers are done; next is Fajr tomorrow.";
}

export function quranSentence(passage: QuranPassage, lang: Lang, withTranslation: boolean): string {
  const heading = lang === 'ar' ? `${passage.surahNameAr} (${passage.reference})` : `${passage.surahName}, ${passage.reference}`;
  if (lang === 'ar') return `${heading}: ${passage.arabic}`;
  return withTranslation ? `${heading}. ${passage.english}` : `${heading}. ${passage.arabic}`;
}

export function headlinesSentence(items: Headline[], lang: Lang, space = false): string {
  const top = items.slice(0, 3).map((h) => h.title.replace(/\s*\|.*$/, '').trim());
  if (top.length === 0) return lang === 'ar' ? 'لا توجد عناوين الآن.' : 'No headlines right now.';
  const lead = space
    ? lang === 'ar' ? 'أخبار الفضاء فقط' : 'Space news only'
    : lang === 'ar' ? `أهم العناوين من ${items[0]!.outlet}` : `Top headlines from ${items[0]!.outlet}`;
  return `${lead}: ${top.join(lang === 'ar' ? '. ' : '. ')}.`;
}

/** A failed read, said honestly. Never a guess dressed up as data. */
export function failureSentence(
  failure: Extract<LiveResult<unknown>, { ok: false }>,
  what: 'weather' | 'prayer' | 'quran' | 'news' | 'place' | 'joke' | 'location',
  lang: Lang,
): string {
  const ar = lang === 'ar';
  switch (failure.code) {
    case 'offline':
      return ar ? 'لا يوجد اتصال بالإنترنت الآن، ولا أملك نسخة محفوظة لهذا.' : "I'm offline, and I don't have a saved copy of that.";
    case 'timeout':
      return ar ? 'الخدمة لم ترد في الوقت. جرّب بعد قليل.' : "The service didn't answer in time. Try again in a moment.";
    case 'rate-limited':
      return ar ? 'الخدمة مشغولة الآن. جرّب بعد دقيقة.' : 'That service is busy right now. Try again in a minute.';
    case 'blocked':
      return what === 'location'
        ? ar ? 'تحديد الموقع التقريبي مطفأ. فعّله من الإعدادات إن أردت.' : 'Approximate location is off. You can turn it on in settings.'
        : ar ? 'هذه الخدمة غير مسموحة في وضع التكلفة صفر.' : "That service isn't allowed in zero-cost mode.";
    case 'missing-key':
      return ar
        ? 'العناوين تحتاج مفتاح The Guardian المجاني. أضفه مرة واحدة من الإعدادات.'
        : 'Headlines need your free Guardian key. Add it once in settings.';
    case 'not-found':
      return ar ? 'لم أجد هذا المكان.' : "I couldn't find that place.";
    case 'ambiguous':
      return ar
        ? `أي واحدة تقصد: ${(failure.options ?? []).join('، أو ')}؟`
        : `Which one do you mean: ${(failure.options ?? []).join(', or ')}?`;
    case 'invalid-input':
      return what === 'quran'
        ? ar ? 'لم أفهم رقم الآية. قل مثلًا: سورة البقرة آية ٢٥٥.' : 'I didn\'t catch the verse. Say, for example, "surah 2 verse 255".'
        : ar ? 'الطلب غير صحيح.' : "That request isn't valid.";
    default:
      return what === 'quran'
        ? ar ? 'لا أستطيع جلب النص الموثّق الآن، ولن أقرأه من الذاكرة.' : "I can't fetch the verified text right now, and I won't recite it from memory."
        : ar ? 'الخدمة غير متاحة الآن.' : 'That service is unavailable right now.';
  }
}
