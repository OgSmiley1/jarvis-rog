import { z } from 'zod';
import { HOUR, MINUTE, liveCache, localDate, nextLocalMidnight, type LiveCache } from '@/lib/net/cache';
import { requestJson, type FailureCode, type FetchLike } from '@/lib/net/http';
import { PROVIDERS, type PolicySettings } from '@/lib/net/providerPolicy';
import { findKnownCity, type City } from './cities';

/**
 * The free, keyless (or free-key) live-data sources JARVIS answers from.
 *
 * One typed function per API. Each one validates the response shape at
 * runtime (an HTTP 200 with the wrong body is a failure, not an answer),
 * caches with a key that includes every parameter that changes the answer,
 * and falls back to a stale cached value — labelled with its age — when the
 * network is gone. API text is data: it is formatted into sentences, never
 * obeyed as instructions.
 *
 * Endpoints and response shapes are those in each provider's public docs, as
 * recorded in the build brief's live probe of 2026-09-30.
 */

export type LiveResult<T> =
  | { ok: true; data: T; source: string; fetchedAt: number; validUntil?: number; stale: boolean; ageMs: number }
  | { ok: false; code: FailureCode | 'not-found' | 'ambiguous' | 'missing-key'; retryAfterMs?: number; detail?: string; options?: string[] };

export interface LiveDeps {
  policy: PolicySettings;
  fetchImpl?: FetchLike;
  cache?: LiveCache;
  now?: () => number;
  signal?: AbortSignal;
  deadlineAt?: number;
  reserveRead?: () => (() => void) | null;
  sleep?: (ms: number) => Promise<void>;
}

function base(deps: LiveDeps) {
  return {
    policy: deps.policy,
    fetchImpl: deps.fetchImpl,
    signal: deps.signal,
    deadlineAt: deps.deadlineAt,
    reserveRead: deps.reserveRead,
    now: deps.now,
    sleep: deps.sleep,
  };
}

/**
 * Cache-first read. Fresh → cache. Stale or missing → network; on network
 * failure a stale entry is returned with its age instead of nothing.
 */
async function cached<T>(
  deps: LiveDeps,
  key: string,
  source: string,
  fetcher: () => Promise<{ ok: true; data: T } | { ok: false; code: FailureCode; retryAfterMs?: number; detail?: string }>,
  lifetime: (now: number) => { validUntil: number; expiresAt?: number },
): Promise<LiveResult<T>> {
  const cache = deps.cache ?? liveCache;
  const now = (deps.now ?? Date.now)();
  const lookup = await cache.get<T>(key, now);
  if (lookup.hit && !lookup.stale) {
    return { ok: true, data: lookup.entry.data, source, fetchedAt: lookup.entry.fetchedAt, validUntil: lookup.entry.validUntil, stale: false, ageMs: lookup.ageMs };
  }
  const fresh = await fetcher();
  if (fresh.ok) {
    const life = lifetime(now);
    await cache.set(key, { data: fresh.data, source, fetchedAt: now, ...life });
    return { ok: true, data: fresh.data, source, fetchedAt: now, validUntil: life.validUntil, stale: false, ageMs: 0 };
  }
  // Stale-while-offline: an old answer, clearly dated, beats silence. Never
  // used for data that has hard-expired (the cache already refused those).
  if (lookup.hit) {
    return { ok: true, data: lookup.entry.data, source, fetchedAt: lookup.entry.fetchedAt, validUntil: lookup.entry.validUntil, stale: true, ageMs: lookup.ageMs };
  }
  return { ok: false, code: fresh.code, retryAfterMs: fresh.retryAfterMs, detail: fresh.detail };
}

function validated<T>(schema: z.ZodType<T>, value: unknown): { ok: true; data: T } | { ok: false; code: FailureCode; detail: string } {
  const parsed = schema.safeParse(value);
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, code: 'unavailable', detail: 'unexpected response shape' };
}

// ── Places ─────────────────────────────────────────────────────────────────

const GeoSchema = z.object({
  results: z
    .array(
      z.object({
        name: z.string(),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        country: z.string().optional(),
        country_code: z.string().optional(),
        timezone: z.string().optional(),
        admin1: z.string().optional(),
        population: z.number().optional(),
      }),
    )
    .optional(),
});

/**
 * A named place → one city. The built-in table answers first (offline).
 * Otherwise Open-Meteo's geocoder; several matches in different countries
 * with none in the home country is `ambiguous` and JARVIS asks which.
 */
export async function resolveCity(query: string, deps: LiveDeps, homeCountryCode = 'AE'): Promise<LiveResult<City>> {
  const known = findKnownCity(query);
  const now = (deps.now ?? Date.now)();
  if (known) return { ok: true, data: known, source: 'built-in', fetchedAt: now, stale: false, ageMs: 0 };
  const name = query.trim().slice(0, 80);
  if (name.length < 2) return { ok: false, code: 'invalid-input' };
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=en&format=json`;
  const result = await cached<City[]>(deps, `geo:${name.toLowerCase()}`, PROVIDERS['open-meteo-geocoding']!.name, async () => {
    const response = await requestJson(url, { provider: 'open-meteo-geocoding', ...base(deps) });
    if (!response.ok) return response;
    const shape = validated(GeoSchema, response.data);
    if (!shape.ok) return shape;
    const cities: City[] = (shape.data.results ?? [])
      .filter((r) => r.timezone)
      .map((r) => ({
        name: r.name,
        nameAr: r.name,
        country: r.country ?? '',
        countryCode: (r.country_code ?? '').toUpperCase(),
        latitude: r.latitude,
        longitude: r.longitude,
        timezone: r.timezone!,
      }));
    return { ok: true, data: cities };
  }, (t) => ({ validUntil: t + 30 * 24 * HOUR }));
  if (!result.ok) return result;
  const cities = result.data;
  if (cities.length === 0) return { ok: false, code: 'not-found' };
  const home = cities.find((c) => c.countryCode === homeCountryCode);
  if (home) return { ...result, data: home };
  const countries = new Set(cities.map((c) => c.countryCode));
  if (countries.size > 1) {
    return { ok: false, code: 'ambiguous', options: cities.slice(0, 3).map((c) => `${c.name}, ${c.country}`) };
  }
  return { ...result, data: cities[0]! };
}

// ── Weather (Open-Meteo) ───────────────────────────────────────────────────

const WeatherSchema = z.object({
  timezone: z.string(),
  current: z.object({
    time: z.string(),
    temperature_2m: z.number(),
    apparent_temperature: z.number().optional(),
    relative_humidity_2m: z.number().optional(),
    wind_speed_10m: z.number().optional(),
    weather_code: z.number().int(),
  }),
  daily: z.object({
    time: z.array(z.string()).min(2),
    weather_code: z.array(z.number().int()).min(2),
    temperature_2m_max: z.array(z.number()).min(2),
    temperature_2m_min: z.array(z.number()).min(2),
    precipitation_probability_max: z.array(z.number().nullable()).optional(),
  }),
});

export type TemperatureUnit = 'celsius' | 'fahrenheit';

export interface WeatherReport {
  city: string;
  cityAr: string;
  unit: TemperatureUnit;
  now: { temperature: number; feelsLike?: number; humidity?: number; windKmh?: number; code: number; observedAt: string };
  days: { date: string; code: number; max: number; min: number; rainChance?: number }[];
}

export async function getWeather(city: City, unit: TemperatureUnit, deps: LiveDeps): Promise<LiveResult<WeatherReport>> {
  const lat = city.latitude.toFixed(4);
  const lon = city.longitude.toFixed(4);
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
    `&timezone=${encodeURIComponent(city.timezone)}&forecast_days=2&temperature_unit=${unit}&wind_speed_unit=kmh`;
  return cached<WeatherReport>(deps, `wx:${lat},${lon}:${unit}`, 'Open-Meteo', async () => {
    const response = await requestJson(url, { provider: 'open-meteo', ...base(deps) });
    if (!response.ok) return response;
    const shape = validated(WeatherSchema, response.data);
    if (!shape.ok) return shape;
    const { current, daily } = shape.data;
    return {
      ok: true,
      data: {
        city: city.name,
        cityAr: city.nameAr,
        unit,
        now: {
          temperature: current.temperature_2m,
          feelsLike: current.apparent_temperature,
          humidity: current.relative_humidity_2m,
          windKmh: current.wind_speed_10m,
          code: current.weather_code,
          observedAt: current.time,
        },
        days: daily.time.slice(0, 2).map((date, i) => ({
          date,
          code: daily.weather_code[i]!,
          max: daily.temperature_2m_max[i]!,
          min: daily.temperature_2m_min[i]!,
          rainChance: daily.precipitation_probability_max?.[i] ?? undefined,
        })),
      },
    };
  }, (t) => ({ validUntil: t + 25 * MINUTE, expiresAt: t + 12 * HOUR }));
}

// ── Prayer times (Aladhan) ─────────────────────────────────────────────────

export const PRAYERS = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const;
export type Prayer = (typeof PRAYERS)[number];

const PrayerSchema = z.object({
  code: z.literal(200),
  data: z.object({
    timings: z.object(Object.fromEntries(PRAYERS.map((p) => [p, z.string().regex(/^\d{2}:\d{2}/)])) as Record<Prayer, z.ZodString>),
    date: z.object({ gregorian: z.object({ date: z.string() }) }),
    meta: z.object({ timezone: z.string(), method: z.object({ id: z.number().optional(), name: z.string() }).optional() }),
  }),
});

export interface PrayerSchedule {
  city: string;
  cityAr: string;
  /** YYYY-MM-DD, local to the city. */
  date: string;
  timezone: string;
  method: string;
  times: Record<Prayer, string>;
}

/** Today's (or a given local date's) schedule. Expires at that date's local midnight. */
export async function getPrayerTimes(city: City, deps: LiveDeps, forDate?: string): Promise<LiveResult<PrayerSchedule>> {
  const now = (deps.now ?? Date.now)();
  const date = forDate ?? localDate(now, city.timezone);
  const [y, m, d] = date.split('-');
  const method = city.prayerMethod;
  const url =
    `https://api.aladhan.com/v1/timings/${d}-${m}-${y}?latitude=${city.latitude.toFixed(4)}&longitude=${city.longitude.toFixed(4)}` +
    `${method === undefined ? '' : `&method=${method}`}&timezonestring=${encodeURIComponent(city.timezone)}`;
  const key = `prayer:${date}:${city.latitude.toFixed(4)},${city.longitude.toFixed(4)}:${city.timezone}:${method ?? 'auto'}`;
  return cached<PrayerSchedule>(deps, key, 'Aladhan', async () => {
    const response = await requestJson(url, { provider: 'aladhan', ...base(deps) });
    if (!response.ok) return response;
    const shape = validated(PrayerSchema, response.data);
    if (!shape.ok) return shape;
    const { data } = shape.data;
    // The answer must be for the date and zone we asked about, or it is not an answer.
    if (data.date.gregorian.date !== `${d}-${m}-${y}` || data.meta.timezone !== city.timezone) {
      return { ok: false, code: 'unavailable', detail: 'schedule for a different date or zone' };
    }
    const times = Object.fromEntries(PRAYERS.map((p) => [p, data.timings[p].slice(0, 5)])) as Record<Prayer, string>;
    return {
      ok: true,
      data: { city: city.name, cityAr: city.nameAr, date, timezone: city.timezone, method: data.meta.method?.name ?? 'default', times },
    };
  }, () => {
    // Valid all day, gone at local midnight — the date is also in the key.
    // A schedule asked for by date (tomorrow's) keeps two days; today's ends at midnight.
    const expires = forDate ? now + 48 * HOUR : nextLocalMidnight(now, city.timezone);
    return { validUntil: expires, expiresAt: expires };
  });
}

/** Minutes since local midnight of a "HH:MM" time. */
const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** The next of the five prayers after `now`, or null when Isha has passed (ask tomorrow's). */
export function nextPrayer(schedule: PrayerSchedule, now: number): { prayer: Prayer; time: string } | null {
  let local: string;
  try {
    local = new Intl.DateTimeFormat('en-GB', { timeZone: schedule.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(now));
  } catch {
    const d = new Date(now);
    local = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  const current = minutesOf(local);
  for (const prayer of PRAYERS) {
    if (prayer === 'Sunrise') continue;
    if (minutesOf(schedule.times[prayer]) > current) return { prayer, time: schedule.times[prayer] };
  }
  return null;
}

// ── Quran (Al Quran Cloud) ─────────────────────────────────────────────────

const AyahSchema = z.object({
  code: z.literal(200),
  data: z
    .array(
      z.object({
        text: z.string().min(1),
        numberInSurah: z.number().int(),
        edition: z.object({ identifier: z.string() }),
        surah: z.object({ number: z.number().int(), englishName: z.string(), name: z.string() }),
      }),
    )
    .length(2),
});

const SurahSchema = z.object({
  code: z.literal(200),
  data: z
    .array(
      z.object({
        number: z.number().int(),
        englishName: z.string(),
        name: z.string(),
        edition: z.object({ identifier: z.string() }),
        ayahs: z.array(z.object({ numberInSurah: z.number().int(), text: z.string().min(1) })).min(1).max(10),
      }),
    )
    .length(2),
});

export interface QuranPassage {
  reference: string;
  surahName: string;
  surahNameAr: string;
  arabic: string;
  english: string;
  editions: { arabic: string; english: string };
}

const ARABIC_EDITION = 'quran-uthmani';
const ENGLISH_EDITION = 'en.sahih';

/** Short surahs that can be recited whole. Longer ones are fetched by verse. */
export const SHORT_SURAHS = new Set([1, 103, 108, 112, 113, 114]);

/**
 * Exact text of a verse ("2:255") or a short surah ("1"). Scripture is only
 * ever read from the source (or its verified cached copy) — never produced
 * by a language model. Both editions must match the reference requested.
 */
export async function getQuran(reference: string, deps: LiveDeps): Promise<LiveResult<QuranPassage>> {
  const verse = /^(\d{1,3}):(\d{1,3})$/.exec(reference);
  const surahOnly = /^(\d{1,3})$/.exec(reference);
  if (!verse && !(surahOnly && SHORT_SURAHS.has(Number(surahOnly[1])))) return { ok: false, code: 'invalid-input' };
  const surah = Number((verse ?? surahOnly)![1]);
  if (surah < 1 || surah > 114) return { ok: false, code: 'invalid-input' };
  const editions = `${ARABIC_EDITION},${ENGLISH_EDITION}`;
  const url = verse
    ? `https://api.alquran.cloud/v1/ayah/${surah}:${Number(verse[2])}/editions/${editions}`
    : `https://api.alquran.cloud/v1/surah/${surah}/editions/${editions}`;

  return cached<QuranPassage>(deps, `quran:${reference}:${editions}`, 'Al Quran Cloud (quran-uthmani, Sahih International)', async () => {
    const response = await requestJson(url, { provider: 'quran-cloud', ...base(deps) });
    if (!response.ok) return response;
    if (verse) {
      const shape = validated(AyahSchema, response.data);
      if (!shape.ok) return shape;
      const [ar, en] = shape.data.data;
      if (!ar || !en || ar.edition.identifier !== ARABIC_EDITION || en.edition.identifier !== ENGLISH_EDITION) {
        return { ok: false, code: 'unavailable', detail: 'edition mismatch' };
      }
      if (ar.surah.number !== surah || ar.numberInSurah !== Number(verse[2]) || en.numberInSurah !== ar.numberInSurah) {
        return { ok: false, code: 'unavailable', detail: 'verse mismatch' };
      }
      return {
        ok: true,
        data: { reference, surahName: ar.surah.englishName, surahNameAr: ar.surah.name, arabic: ar.text, english: en.text, editions: { arabic: ARABIC_EDITION, english: ENGLISH_EDITION } },
      };
    }
    const shape = validated(SurahSchema, response.data);
    if (!shape.ok) return shape;
    const [ar, en] = shape.data.data;
    if (!ar || !en || ar.number !== surah || en.number !== surah || ar.ayahs.length !== en.ayahs.length) {
      return { ok: false, code: 'unavailable', detail: 'surah mismatch' };
    }
    return {
      ok: true,
      data: {
        reference,
        surahName: ar.englishName,
        surahNameAr: ar.name,
        arabic: ar.ayahs.map((a) => a.text).join(' ۝ '),
        english: en.ayahs.map((a) => a.text).join(' '),
        editions: { arabic: ARABIC_EDITION, english: ENGLISH_EDITION },
      },
    };
  }, (t) => ({ validUntil: t + 365 * 24 * HOUR }));
}

// ── News ───────────────────────────────────────────────────────────────────

export interface Headline {
  title: string;
  url: string;
  publishedAt: string;
  outlet: string;
}

const GuardianSchema = z.object({
  response: z.object({
    status: z.literal('ok'),
    results: z.array(z.object({ webTitle: z.string(), webUrl: z.string().url(), webPublicationDate: z.string() })),
  }),
});

/** Guardian headlines. Needs the owner's own free key; without it, says so. */
export async function getHeadlines(topic: string, apiKey: string | null, deps: LiveDeps): Promise<LiveResult<Headline[]>> {
  if (!apiKey) return { ok: false, code: 'missing-key' };
  const q = topic.trim().slice(0, 60);
  const url = `https://content.guardianapis.com/search?${q ? `q=${encodeURIComponent(q)}&` : ''}order-by=newest&page-size=5&api-key=${encodeURIComponent(apiKey)}`;
  return cached<Headline[]>(deps, `news:guardian:${q.toLowerCase()}`, 'The Guardian', async () => {
    const response = await requestJson(url, { provider: 'guardian', ...base(deps) });
    if (!response.ok) return response;
    const shape = validated(GuardianSchema, response.data);
    if (!shape.ok) return shape;
    return {
      ok: true,
      data: shape.data.response.results.map((r) => ({ title: r.webTitle, url: r.webUrl, publishedAt: r.webPublicationDate, outlet: 'The Guardian' })),
    };
  }, (t) => ({ validUntil: t + HOUR, expiresAt: t + 24 * HOUR }));
}

const SpaceSchema = z.object({
  results: z.array(z.object({ title: z.string(), url: z.string().url(), news_site: z.string(), published_at: z.string() })),
});

/** Space-flight news only — labelled as such, never passed off as general news. */
export async function getSpaceNews(deps: LiveDeps): Promise<LiveResult<Headline[]>> {
  const url = 'https://api.spaceflightnewsapi.net/v4/articles/?limit=5';
  return cached<Headline[]>(deps, 'news:space', 'Spaceflight News API', async () => {
    const response = await requestJson(url, { provider: 'spaceflight', ...base(deps) });
    if (!response.ok) return response;
    const shape = validated(SpaceSchema, response.data);
    if (!shape.ok) return shape;
    return { ok: true, data: shape.data.results.map((r) => ({ title: r.title, url: r.url, publishedAt: r.published_at, outlet: r.news_site })) };
  }, (t) => ({ validUntil: t + HOUR, expiresAt: t + 24 * HOUR }));
}

// ── Personality ────────────────────────────────────────────────────────────

const JokeSchema = z.union([
  z.object({ error: z.literal(false), type: z.literal('single'), joke: z.string(), safe: z.literal(true) }),
  z.object({ error: z.literal(false), type: z.literal('twopart'), setup: z.string(), delivery: z.string(), safe: z.literal(true) }),
]);

/** A safe-mode joke from JokeAPI. Not cached: the point is a new one. */
export async function getJoke(deps: LiveDeps): Promise<LiveResult<string>> {
  const url = 'https://v2.jokeapi.dev/joke/Any?safe-mode&blacklistFlags=nsfw,religious,political,racist,sexist,explicit';
  const response = await requestJson(url, { provider: 'jokeapi', ...base(deps) });
  const now = (deps.now ?? Date.now)();
  if (!response.ok) return response;
  const shape = validated(JokeSchema, response.data);
  if (!shape.ok) return shape;
  const joke = shape.data.type === 'single' ? shape.data.joke : `${shape.data.setup} … ${shape.data.delivery}`;
  return { ok: true, data: joke.slice(0, 400), source: 'JokeAPI', fetchedAt: now, stale: false, ageMs: 0 };
}

const QuoteSchema = z.array(z.object({ q: z.string().min(1), a: z.string().min(1) })).min(1);

export async function getQuote(deps: LiveDeps): Promise<LiveResult<{ text: string; author: string }>> {
  const response = await requestJson('https://zenquotes.io/api/random', { provider: 'zenquotes', ...base(deps) });
  const now = (deps.now ?? Date.now)();
  if (!response.ok) return response;
  const shape = validated(QuoteSchema, response.data);
  if (!shape.ok) return shape;
  const [first] = shape.data;
  // ZenQuotes answers rate-limited callers with a quote whose "author" is the notice.
  if (!first || /zenquotes/i.test(first.a)) return { ok: false, code: 'rate-limited' };
  return { ok: true, data: { text: first.q.slice(0, 300), author: first.a.slice(0, 80) }, source: 'ZenQuotes', fetchedAt: now, stale: false, ageMs: 0 };
}

// ── Approximate location (GeoJS, opt-in) ───────────────────────────────────

const GeoJsSchema = z.object({
  city: z.string().optional(),
  country: z.string().optional(),
  country_code: z.string().optional(),
  latitude: z.string(),
  longitude: z.string(),
  timezone: z.string().optional(),
});

/** Where the internet connection appears to be. Approximate; never changes the home city by itself. */
export async function getIpLocation(deps: LiveDeps): Promise<LiveResult<{ city?: string; country?: string; approximate: true }>> {
  return cached(deps, 'geojs', 'GeoJS (approximate)', async () => {
    const response = await requestJson('https://get.geojs.io/v1/ip/geo.json', { provider: 'geojs', ...base(deps) });
    if (!response.ok) return response;
    const shape = validated(GeoJsSchema, response.data);
    if (!shape.ok) return shape;
    return { ok: true, data: { city: shape.data.city, country: shape.data.country, approximate: true as const } };
  }, (t) => ({ validUntil: t + 30 * MINUTE, expiresAt: t + 6 * HOUR }));
}
