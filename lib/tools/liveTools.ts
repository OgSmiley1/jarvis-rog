import { z } from 'zod';
import type { PolicySettings } from '@/lib/net/providerPolicy';
import { readFreeApiKey } from '@/lib/net/apiKeys';
import { DEFAULT_HOME_CITY, findKnownCity, type City } from './cities';
import {
  getHeadlines,
  getIpLocation,
  getJoke,
  getPrayerTimes,
  getQuote,
  getQuran,
  getSpaceNews,
  getWeather,
  nextPrayer,
  resolveCity,
  PRAYERS,
  type LiveDeps,
  type LiveResult,
  type TemperatureUnit,
} from './freeApis';
import { failureSentence, headlinesSentence, prayerSentence, quranSentence, weatherSentence } from './liveSpeech';
import { localJoke, localLine } from './localExtras';
import type { ToolDefinition, ToolRunContext } from './types';

/**
 * Live-data tools: each is one validated read (two for the combined brief),
 * formatted straight into a sentence. The settings they need — zero-cost
 * policy, home city, units — come from the app through one reader, so these
 * stay importable (and testable) without React.
 */

export interface LiveSettings {
  policy: PolicySettings;
  homeCity: string;
  unit: TemperatureUnit;
}

let settingsReader: () => LiveSettings = () => ({ policy: { strict: true }, homeCity: DEFAULT_HOME_CITY, unit: 'celsius' });
let fetchOverride: LiveDeps['fetchImpl'];

export function setLiveSettingsReader(reader: () => LiveSettings): void {
  settingsReader = reader;
}

/** Tests inject a fake network here. */
export function setLiveFetch(fetchImpl: LiveDeps['fetchImpl']): void {
  fetchOverride = fetchImpl;
}

function deps(context?: ToolRunContext): LiveDeps {
  return { policy: settingsReader().policy, fetchImpl: fetchOverride, signal: context?.signal, deadlineAt: context?.deadlineAt, reserveRead: context?.reserveRead };
}

const lang = z.enum(['en', 'ar']).default('en');

/** The result every live tool returns: a sentence plus where it came from. */
export interface LiveSpeech {
  speech: string;
  source?: string;
  fetchedAt?: number;
  stale?: boolean;
  private?: boolean;
}

function spoken<T>(result: Extract<LiveResult<T>, { ok: true }>, speech: string): LiveSpeech {
  return { speech, source: result.source, fetchedAt: result.fetchedAt, stale: result.stale };
}

/** The named city, or the owner's home city. Never a guess from coordinates. */
async function cityFor(name: string | undefined, d: LiveDeps): Promise<LiveResult<City>> {
  const target = name?.trim() || settingsReader().homeCity || DEFAULT_HOME_CITY;
  const known = findKnownCity(target);
  if (known) return { ok: true, data: known, source: 'built-in', fetchedAt: Date.now(), stale: false, ageMs: 0 };
  return resolveCity(target, d);
}

async function weather(input: { city?: string; day: 'today' | 'tomorrow'; unit?: TemperatureUnit; lang: 'en' | 'ar' }, context?: ToolRunContext): Promise<LiveSpeech> {
  const d = deps(context);
  const city = await cityFor(input.city, d);
  if (!city.ok) return { speech: failureSentence(city, 'place', input.lang) };
  const result = await getWeather(city.data, input.unit ?? settingsReader().unit, d);
  if (!result.ok) return { speech: failureSentence(result, 'weather', input.lang) };
  return spoken(result, weatherSentence(result, input.day, input.lang));
}

async function prayer(
  input: { city?: string; prayer?: (typeof PRAYERS)[number]; all?: boolean; tomorrow?: boolean; lang: 'en' | 'ar' },
  context?: ToolRunContext,
): Promise<LiveSpeech> {
  const d = deps(context);
  const city = await cityFor(input.city, d);
  if (!city.ok) return { speech: failureSentence(city, 'place', input.lang) };
  let forDate: string | undefined;
  if (input.tomorrow) {
    const { localDate } = await import('@/lib/net/cache');
    forDate = localDate(Date.now() + 24 * 60 * 60 * 1000, city.data.timezone);
  }
  const result = await getPrayerTimes(city.data, d, forDate);
  if (!result.ok) return { speech: failureSentence(result, 'prayer', input.lang) };
  const next = !input.prayer && !input.all ? nextPrayer(result.data, Date.now()) : undefined;
  return spoken(result, prayerSentence(result, { prayer: input.prayer, all: input.all, tomorrow: input.tomorrow, next }, input.lang));
}

export const liveTools: ToolDefinition[] = [
  {
    name: 'live.weather',
    description: 'Current weather or tomorrow\'s forecast for a city (Open-Meteo, free). Home city when none is named.',
    target: 'ANDROID',
    confirmation: 'none',
    schema: z.object({ city: z.string().max(80).optional(), day: z.enum(['today', 'tomorrow']).default('today'), unit: z.enum(['celsius', 'fahrenheit']).optional(), lang }),
    execute: (input, context) => weather(input, context),
  },
  {
    name: 'live.prayer',
    description: 'Prayer times for a city and date (Aladhan, free): one prayer, the next one, or all five.',
    target: 'ANDROID',
    confirmation: 'none',
    schema: z.object({
      city: z.string().max(80).optional(),
      prayer: z.enum(PRAYERS).optional(),
      all: z.boolean().default(false),
      tomorrow: z.boolean().default(false),
      lang,
    }),
    execute: (input, context) => prayer(input, context),
  },
  {
    name: 'live.brief',
    description: 'Weather and the next prayer together — two reads in parallel.',
    target: 'ANDROID',
    confirmation: 'none',
    schema: z.object({ city: z.string().max(80).optional(), lang }),
    execute: async (input, context) => {
      const [w, p] = await Promise.all([
        weather({ city: input.city, day: 'today', lang: input.lang }, context),
        prayer({ city: input.city, lang: input.lang }, context),
      ]);
      return { speech: `${w.speech} ${p.speech}`, source: [w.source, p.source].filter(Boolean).join(' + '), stale: Boolean(w.stale || p.stale) };
    },
  },
  {
    name: 'live.quran',
    description: 'Recite an exact verse ("2:255") or a short surah from Al Quran Cloud. Never from memory.',
    target: 'ANDROID',
    confirmation: 'none',
    schema: z.object({ reference: z.string().regex(/^\d{1,3}(?::\d{1,3})?$/), translate: z.boolean().default(true), lang }),
    execute: async ({ reference, translate, lang: language }, context) => {
      const result = await getQuran(reference, deps(context));
      if (!result.ok) return { speech: failureSentence(result, 'quran', language) };
      return {
        ...spoken(result, quranSentence(result.data, language, translate)),
        // Both texts travel with the answer so the screen can show them exactly.
        passage: result.data,
      };
    },
  },
  {
    name: 'live.headlines',
    description: 'Latest headlines from The Guardian on a topic (needs the owner\'s free key).',
    target: 'ANDROID',
    confirmation: 'none',
    schema: z.object({ topic: z.string().max(60).default(''), lang }),
    execute: async ({ topic, lang: language }, context) => {
      const result = await getHeadlines(topic, await readFreeApiKey('guardian'), deps(context));
      if (!result.ok) return { speech: failureSentence(result, 'news', language) };
      return { ...spoken(result, headlinesSentence(result.data, language)), links: result.data };
    },
  },
  {
    name: 'live.space_news',
    description: 'Space-flight news only (Spaceflight News API, free).',
    target: 'ANDROID',
    confirmation: 'none',
    schema: z.object({ lang }),
    execute: async ({ lang: language }, context) => {
      const result = await getSpaceNews(deps(context));
      if (!result.ok) return { speech: failureSentence(result, 'news', language) };
      return { ...spoken(result, headlinesSentence(result.data, language, true)), links: result.data };
    },
  },
  {
    name: 'live.joke',
    description: 'A clean joke. Online from JokeAPI (safe mode) when possible, otherwise from JARVIS\'s own list.',
    target: 'ANDROID',
    confirmation: 'none',
    schema: z.object({ lang }),
    execute: async ({ lang: language }, context) => {
      if (language === 'ar') return { speech: localJoke('ar'), source: 'built-in' };
      const result = await getJoke(deps(context));
      return result.ok ? spoken(result, result.data) : { speech: localJoke('en'), source: 'built-in' };
    },
  },
  {
    name: 'live.quote',
    description: 'A line of inspiration — ZenQuotes (attributed) when online, otherwise an unattributed built-in line.',
    target: 'ANDROID',
    confirmation: 'none',
    schema: z.object({ lang }),
    execute: async ({ lang: language }, context) => {
      if (language === 'ar') return { speech: localLine('ar'), source: 'built-in' };
      const result = await getQuote(deps(context));
      return result.ok
        ? spoken(result, `"${result.data.text}" — ${result.data.author}.`)
        : { speech: localLine('en'), source: 'built-in' };
    },
  },
  {
    name: 'live.where_am_i',
    description: 'Approximate city from the internet connection (GeoJS). Opt-in; never changes the home city.',
    target: 'ANDROID',
    confirmation: 'none',
    schema: z.object({ lang }),
    execute: async ({ lang: language }, context) => {
      const result = await getIpLocation(deps(context));
      if (!result.ok) return { speech: failureSentence(result, 'location', language) };
      const place = [result.data.city, result.data.country].filter(Boolean).join(', ');
      const home = settingsReader().homeCity;
      return {
        ...spoken(
          result,
          language === 'ar'
            ? `حسب اتصال الإنترنت، أنت تقريبًا في ${place || 'مكان غير معروف'}. مدينتك الأساسية ما زالت ${home}.`
            : `Going by your internet connection, you're roughly in ${place || 'an unknown place'}. Your home city is still ${home}.`,
        ),
        // Where the owner is stays off the public live log.
        private: true,
      };
    },
  },
];
