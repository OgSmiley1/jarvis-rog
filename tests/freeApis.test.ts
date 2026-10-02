import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveCache, localDate, nextLocalMidnight } from '@/lib/net/cache';
import { parseRetryAfter, requestJson, resetHttpState, type FetchLike } from '@/lib/net/http';
import { PROVIDERS, checkProvider, isAllowanceExhausted, policyAudit, providerForUrl } from '@/lib/net/providerPolicy';
import { KNOWN_CITIES, findKnownCity } from '@/lib/tools/cities';
import { getHeadlines, getPrayerTimes, getQuran, getWeather, nextPrayer, resolveCity, type LiveDeps } from '@/lib/tools/freeApis';
import { failureSentence, prayerSentence, quranSentence, speakableTime, weatherSentence } from '@/lib/tools/liveSpeech';

const STRICT = { strict: true };
const ajman = findKnownCity('Ajman')!;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

/** A fake network: responds by URL, counts calls, records URLs. */
function fakeNet(handler: (url: string) => Response | Promise<Response>) {
  const calls: string[] = [];
  const fetchImpl: FetchLike = async (url) => {
    calls.push(url);
    return handler(url);
  };
  return { calls, fetchImpl };
}

function deps(fetchImpl: FetchLike, now = Date.UTC(2026, 8, 30, 10, 0), cache = new LiveCache()): LiveDeps {
  return { policy: STRICT, fetchImpl, now: () => now, cache, sleep: async () => undefined };
}

const weatherBody = {
  timezone: 'Asia/Dubai',
  current: { time: '2026-09-30T14:00', temperature_2m: 36.4, apparent_temperature: 41.2, relative_humidity_2m: 55, wind_speed_10m: 12, weather_code: 1 },
  daily: {
    time: ['2026-09-30', '2026-10-01'],
    weather_code: [1, 2],
    temperature_2m_max: [38.1, 37],
    temperature_2m_min: [29.4, 28.8],
    precipitation_probability_max: [0, 30],
  },
};

const prayerBody = (date = '30-09-2026', timezone = 'Asia/Dubai') => ({
  code: 200,
  status: 'OK',
  data: {
    timings: { Fajr: '04:47', Sunrise: '06:02', Dhuhr: '12:03', Asr: '15:27', Sunset: '18:04', Maghrib: '18:04', Isha: '19:18', Imsak: '04:37', Midnight: '00:03' },
    date: { gregorian: { date } },
    meta: { timezone, method: { id: 16, name: 'Dubai (experimental)' } },
  },
});

beforeEach(() => resetHttpState());

describe('provider policy (AED 0)', () => {
  it('fails closed on an unknown provider', () => {
    expect(checkProvider('some-new-api', STRICT).allowed).toBe(false);
    expect(checkProvider('libretranslate', STRICT).allowed).toBe(false);
  });

  it('keeps Puter off in strict mode and hard-stops it after the allowance runs out', () => {
    expect(checkProvider('puter', STRICT).allowed).toBe(false);
    expect(checkProvider('puter', { strict: false }).allowed).toBe(false);
    expect(checkProvider('puter', { strict: false, puterConsent: true }).allowed).toBe(true);
    const now = Date.now();
    expect(checkProvider('puter', { strict: false, puterConsent: true, puterExhaustedAt: now - 1000 }, now).allowed).toBe(false);
    expect(isAllowanceExhausted('Insufficient funds: please upgrade')).toBe(true);
  });

  it('Gemini needs its own training switch; IP location is opt-in', () => {
    expect(checkProvider('gemini', STRICT).allowed).toBe(false);
    expect(checkProvider('gemini', { strict: true, allowTraining: true }).allowed).toBe(true);
    expect(checkProvider('geojs', STRICT).allowed).toBe(false);
    expect(checkProvider('geojs', { strict: true, ipLocation: true }).allowed).toBe(true);
  });

  it('every manifest entry records terms, check date, limits and fallback', () => {
    for (const entry of Object.values(PROVIDERS)) {
      expect(entry.termsUrl).toMatch(/^https:\/\//);
      expect(entry.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.limits.length).toBeGreaterThan(3);
      expect(entry.fallback.length).toBeGreaterThan(3);
    }
    expect(providerForUrl('https://api.open-meteo.com/v1/forecast')?.id).toBe('open-meteo');
    expect(providerForUrl('https://evil.example/x')).toBeNull();
  });

  it('a refused provider never sees a request, and the audit records it', async () => {
    const net = fakeNet(() => json({}));
    const result = await requestJson('https://puter.com/x', { provider: 'puter', policy: STRICT, fetchImpl: net.fetchImpl });
    expect(result).toMatchObject({ ok: false, code: 'blocked' });
    expect(net.calls).toHaveLength(0);
    expect(policyAudit().at(-1)).toMatchObject({ provider: 'puter', allowed: false });
  });

  it('a URL on another host is refused even for an allowed provider', async () => {
    const net = fakeNet(() => json({}));
    const result = await requestJson('https://evil.example/v1/forecast', { provider: 'open-meteo', policy: STRICT, fetchImpl: net.fetchImpl });
    expect(result).toMatchObject({ ok: false, code: 'blocked' });
    expect(net.calls).toHaveLength(0);
  });
});

describe('http client', () => {
  const opts = (fetchImpl: FetchLike, extra = {}) => ({ provider: 'open-meteo', policy: STRICT, fetchImpl, sleep: async () => undefined, ...extra });

  it('retries a 5xx once, then succeeds', async () => {
    let n = 0;
    const net = fakeNet(() => (++n === 1 ? json({}, 503) : json({ ok: 1 })));
    const result = await requestJson('https://api.open-meteo.com/v1/a', opts(net.fetchImpl));
    expect(result.ok).toBe(true);
    expect(net.calls).toHaveLength(2);
  });

  it('does not retry a malformed request (4xx)', async () => {
    const net = fakeNet(() => json({}, 400));
    const result = await requestJson('https://api.open-meteo.com/v1/b', opts(net.fetchImpl));
    expect(result).toMatchObject({ ok: false, code: 'invalid-input' });
    expect(net.calls).toHaveLength(1);
  });

  it('reports 429 as rate-limited and honours Retry-After in the retry', async () => {
    const waits: number[] = [];
    const net = fakeNet(() => json({}, 429, { 'retry-after': '2' }));
    const result = await requestJson('https://api.open-meteo.com/v1/c', opts(net.fetchImpl, { sleep: async (ms: number) => void waits.push(ms) }));
    expect(result).toMatchObject({ ok: false, code: 'rate-limited', retryAfterMs: 2000 });
    expect(waits).toEqual([2000]);
    expect(parseRetryAfter('9999', 0)).toBe(60_000);
  });

  it('does not retry when the turn deadline has no room', async () => {
    const net = fakeNet(() => json({}, 503));
    await requestJson('https://api.open-meteo.com/v1/d', opts(net.fetchImpl, { deadlineAt: Date.now() + 100 }));
    expect(net.calls).toHaveLength(1);
  });

  it('flags malformed JSON', async () => {
    const net = fakeNet(() => new Response('<html>oops', { status: 200 }));
    const result = await requestJson('https://api.open-meteo.com/v1/e', opts(net.fetchImpl, { deadlineAt: Date.now() + 100 }));
    expect(result).toMatchObject({ ok: false, code: 'unavailable', detail: 'malformed JSON' });
  });

  it('maps a network failure to offline', async () => {
    const net = fakeNet(() => {
      throw new TypeError('Network request failed');
    });
    const result = await requestJson('https://api.open-meteo.com/v1/f', opts(net.fetchImpl, { deadlineAt: Date.now() + 100 }));
    expect(result).toMatchObject({ ok: false, code: 'offline' });
  });

  it('times out after the configured timeout', async () => {
    const hang: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    const result = await requestJson('https://api.open-meteo.com/v1/g', opts(hang, { timeoutMs: 10, deadlineAt: Date.now() + 100 }));
    expect(result).toMatchObject({ ok: false, code: 'timeout' });
  });

  it('a cancelled turn aborts the request', async () => {
    const controller = new AbortController();
    const hang: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    const pending = requestJson('https://api.open-meteo.com/v1/h', opts(hang, { signal: controller.signal }));
    controller.abort();
    expect(await pending).toMatchObject({ ok: false, detail: 'cancelled' });
  });

  it('shares one request between identical GETs in flight', async () => {
    const net = fakeNet(async () => json({ v: 1 }));
    const [a, b] = await Promise.all([
      requestJson('https://api.open-meteo.com/v1/i', opts(net.fetchImpl)),
      requestJson('https://api.open-meteo.com/v1/i', opts(net.fetchImpl)),
    ]);
    expect(a.ok && b.ok).toBe(true);
    expect(net.calls).toHaveLength(1);
  });

  it('opens the circuit after repeated failures', async () => {
    const net = fakeNet(() => json({}, 400));
    for (let i = 0; i < 3; i += 1) await requestJson(`https://api.open-meteo.com/v1/j${i}`, opts(net.fetchImpl));
    const result = await requestJson('https://api.open-meteo.com/v1/k', opts(net.fetchImpl));
    expect(result).toMatchObject({ ok: false, detail: 'circuit open' });
    expect(net.calls).toHaveLength(3);
  });
});

describe('cache and date boundaries', () => {
  it('computes the local date in the city zone, not the device zone', () => {
    // 21:30 UTC on 30 Sep is 01:30 on 1 Oct in Dubai.
    expect(localDate(Date.UTC(2026, 8, 30, 21, 30), 'Asia/Dubai')).toBe('2026-10-01');
    const midnight = nextLocalMidnight(Date.UTC(2026, 8, 30, 10, 0), 'Asia/Dubai');
    // Dubai midnight of 1 Oct = 20:00 UTC on 30 Sep.
    expect(Math.abs(midnight - Date.UTC(2026, 8, 30, 20, 0))).toBeLessThanOrEqual(1000);
  });

  it('evicts least recently used entries', async () => {
    const cache = new LiveCache(2);
    await cache.set('a', { data: 1, source: 's', fetchedAt: 0, validUntil: 10 });
    await cache.set('b', { data: 2, source: 's', fetchedAt: 0, validUntil: 10 });
    await cache.get('a', 1);
    await cache.set('c', { data: 3, source: 's', fetchedAt: 0, validUntil: 10 });
    expect((await cache.get('b', 1)).hit).toBe(false);
    expect((await cache.get('a', 1)).hit).toBe(true);
  });

  it('a hard-expired entry is never returned', async () => {
    const cache = new LiveCache();
    await cache.set('p', { data: 1, source: 's', fetchedAt: 0, validUntil: 100, expiresAt: 100 });
    expect((await cache.get('p', 101)).hit).toBe(false);
  });
});

describe('weather (Open-Meteo)', () => {
  it('builds the request from the city, not blind coordinates, and speaks the answer', async () => {
    const net = fakeNet(() => json(weatherBody));
    const result = await getWeather(ajman, 'celsius', deps(net.fetchImpl));
    expect(net.calls[0]).toContain(`latitude=${ajman.latitude.toFixed(4)}`);
    expect(net.calls[0]).toContain('timezone=Asia%2FDubai');
    expect(net.calls[0]).not.toContain('latitude=25.20&');
    if (!result.ok) throw new Error('expected ok');
    expect(weatherSentence(result, 'today', 'en')).toBe("It's 36 degrees in Ajman, mainly clear, feels like 41 degrees. Today's high is 38 degrees.");
    expect(weatherSentence(result, 'tomorrow', 'en')).toContain('30% chance of rain');
    expect(weatherSentence(result, 'today', 'ar')).toContain('عجمان');
  });

  it('serves the cache within 25 minutes without a request', async () => {
    const net = fakeNet(() => json(weatherBody));
    const cache = new LiveCache();
    const t = Date.UTC(2026, 8, 30, 10, 0);
    await getWeather(ajman, 'celsius', deps(net.fetchImpl, t, cache));
    await getWeather(ajman, 'celsius', deps(net.fetchImpl, t + 10 * 60_000, cache));
    expect(net.calls).toHaveLength(1);
  });

  it('offline: returns the stale reading with its age instead of nothing', async () => {
    const cache = new LiveCache();
    const t = Date.UTC(2026, 8, 30, 10, 0);
    await getWeather(ajman, 'celsius', deps(fakeNet(() => json(weatherBody)).fetchImpl, t, cache));
    const offline = fakeNet(() => {
      throw new TypeError('Network request failed');
    });
    const result = await getWeather(ajman, 'celsius', deps(offline.fetchImpl, t + 40 * 60_000, cache));
    if (!result.ok) throw new Error('expected stale ok');
    expect(result.stale).toBe(true);
    expect(weatherSentence(result, 'today', 'en')).toContain("last updated 40 minutes ago — I'm offline");
  });

  it('rejects a 200 with the wrong shape', async () => {
    const net = fakeNet(() => json({ hello: 'world' }));
    const result = await getWeather(ajman, 'celsius', deps(net.fetchImpl));
    expect(result).toMatchObject({ ok: false, code: 'unavailable' });
  });
});

describe('prayer times (Aladhan)', () => {
  it('asks for the local date in the city zone with the UAE method, and answers Maghrib', async () => {
    const net = fakeNet(() => json(prayerBody()));
    const result = await getPrayerTimes(ajman, deps(net.fetchImpl));
    expect(net.calls[0]).toContain('/timings/30-09-2026?');
    expect(net.calls[0]).toContain('method=16');
    if (!result.ok) throw new Error('expected ok');
    expect(prayerSentence(result, { prayer: 'Maghrib' }, 'en')).toBe('Maghrib today in Ajman is at 6:04 PM.');
    expect(prayerSentence(result, { prayer: 'Maghrib' }, 'ar')).toBe('المغرب اليوم في عجمان الساعة 6:04 مساءً.');
  });

  it('refuses a schedule for a different date or zone', async () => {
    const net = fakeNet(() => json(prayerBody('29-09-2026')));
    expect(await getPrayerTimes(ajman, deps(net.fetchImpl))).toMatchObject({ ok: false, code: 'unavailable' });
    resetHttpState();
    const net2 = fakeNet(() => json(prayerBody('30-09-2026', 'Asia/Riyadh')));
    expect(await getPrayerTimes(ajman, deps(net2.fetchImpl))).toMatchObject({ ok: false, code: 'unavailable' });
  });

  it("never serves yesterday's schedule after local midnight, even offline", async () => {
    const cache = new LiveCache();
    const beforeMidnight = Date.UTC(2026, 8, 30, 19, 50); // 23:50 Dubai
    await getPrayerTimes(ajman, deps(fakeNet(() => json(prayerBody())).fetchImpl, beforeMidnight, cache));
    const offline = fakeNet(() => {
      throw new TypeError('Network request failed');
    });
    const afterMidnight = Date.UTC(2026, 8, 30, 20, 10); // 00:10 Dubai, 1 Oct
    const result = await getPrayerTimes(ajman, deps(offline.fetchImpl, afterMidnight, cache));
    expect(result.ok).toBe(false);
    expect(offline.calls[0]).toContain('/timings/01-10-2026?');
  });

  it('finds the next prayer in the city clock', () => {
    const schedule = { city: 'Ajman', cityAr: 'عجمان', date: '2026-09-30', timezone: 'Asia/Dubai', method: 'x', times: prayerBody().data.timings as never };
    // 13:00 UTC = 17:00 Dubai → Maghrib next.
    expect(nextPrayer(schedule, Date.UTC(2026, 8, 30, 13, 0))).toEqual({ prayer: 'Maghrib', time: '18:04' });
    expect(nextPrayer(schedule, Date.UTC(2026, 8, 30, 16, 0))).toBeNull();
    expect(speakableTime('00:03', 'en')).toBe('12:03 AM');
  });
});

describe('Quran (exact text only)', () => {
  const ayah = (overrides: Record<string, unknown> = {}) => ({
    code: 200,
    data: [
      { text: 'ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ ٱلْحَىُّ ٱلْقَيُّومُ', numberInSurah: 255, edition: { identifier: 'quran-uthmani' }, surah: { number: 2, englishName: 'Al-Baqara', name: 'سُورَةُ البَقَرَةِ' }, ...overrides },
      { text: 'Allah - there is no deity except Him, the Ever-Living, the Sustainer of existence.', numberInSurah: 255, edition: { identifier: 'en.sahih' }, surah: { number: 2, englishName: 'Al-Baqara', name: 'سُورَةُ البَقَرَةِ' } },
    ],
  });

  it('fetches Ayat al-Kursi in both editions and keeps the text verbatim', async () => {
    const net = fakeNet(() => json(ayah()));
    const result = await getQuran('2:255', deps(net.fetchImpl));
    expect(net.calls[0]).toBe('https://api.alquran.cloud/v1/ayah/2:255/editions/quran-uthmani,en.sahih');
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.arabic).toBe(ayah().data[0]!.text);
    expect(quranSentence(result.data, 'en', true)).toContain('Ever-Living');
  });

  it('refuses a response for the wrong verse or edition — no near-miss scripture', async () => {
    const wrongVerse = fakeNet(() => json(ayah({ numberInSurah: 256 })));
    expect(await getQuran('2:255', deps(wrongVerse.fetchImpl))).toMatchObject({ ok: false });
    resetHttpState();
    const wrongEdition = fakeNet(() => json(ayah({ edition: { identifier: 'quran-simple' } })));
    expect(await getQuran('2:255', deps(wrongEdition.fetchImpl))).toMatchObject({ ok: false });
  });

  it('unavailable says so and never offers text from memory', () => {
    const sentence = failureSentence({ ok: false, code: 'unavailable' }, 'quran', 'en');
    expect(sentence).toContain("won't recite it from memory");
  });

  it('rejects malformed references without a request', async () => {
    const net = fakeNet(() => json({}));
    expect(await getQuran('2', deps(net.fetchImpl))).toMatchObject({ ok: false, code: 'invalid-input' });
    expect(await getQuran('999:1', deps(net.fetchImpl))).toMatchObject({ ok: false, code: 'invalid-input' });
    expect(net.calls).toHaveLength(0);
  });
});

describe('places and news', () => {
  it('resolves known cities offline, Arabic names too', async () => {
    const net = fakeNet(() => json({}));
    const result = await resolveCity('عجمان', deps(net.fetchImpl));
    expect(result).toMatchObject({ ok: true, data: { name: 'Ajman' } });
    expect(net.calls).toHaveLength(0);
    expect(KNOWN_CITIES.every((c) => c.timezone.includes('/'))).toBe(true);
  });

  it('an ambiguous name asks which one', async () => {
    const net = fakeNet(() =>
      json({ results: [
        { name: 'Paris', latitude: 48.85, longitude: 2.35, country: 'France', country_code: 'FR', timezone: 'Europe/Paris' },
        { name: 'Paris', latitude: 33.66, longitude: -95.55, country: 'United States', country_code: 'US', timezone: 'America/Chicago' },
      ] }),
    );
    const result = await resolveCity('Paris', deps(net.fetchImpl));
    expect(result).toMatchObject({ ok: false, code: 'ambiguous' });
    if (result.ok) return;
    expect(failureSentence(result, 'place', 'en')).toBe('Which one do you mean: Paris, France, or Paris, United States?');
  });

  it('headlines without a key say how to add one, and make no request', async () => {
    const net = fakeNet(() => json({}));
    const result = await getHeadlines('Dubai', null, deps(net.fetchImpl));
    expect(result).toMatchObject({ ok: false, code: 'missing-key' });
    expect(net.calls).toHaveLength(0);
  });
});

import { zoneParts } from '@/lib/net/cache';
import { looksLikeToolRequest } from '@/lib/tools/planner';

describe('review fixes', () => {
  it('zone time without Intl falls back to the fixed Gulf offset, never the device zone', () => {
    const t = Date.UTC(2026, 8, 30, 21, 30); // 01:30 on 1 Oct in Dubai
    expect(zoneParts(t, 'Asia/Dubai', false)).toMatchObject({ year: 2026, month: 10, day: 1, hour: 1, minute: 30 });
    expect(zoneParts(t, 'Asia/Riyadh', false)).toMatchObject({ day: 1, hour: 0 });
    expect(zoneParts(t, 'Asia/Dubai')).toEqual(zoneParts(t, 'Asia/Dubai', false));
  });

  it('natural phrasing of live requests reaches the tool planner', () => {
    for (const text of ['is it going to be humid this weekend over in Sharjah', 'remind me in ten minutes to stretch', 'what did the news say about the Expo', 'هل الجو حار في العين']) {
      expect(looksLikeToolRequest(text)).toBe(true);
    }
    expect(looksLikeToolRequest('tell me about the history of Ajman')).toBe(false);
  });

  it('a cancelled turn sharing a request does not hand "cancelled" to the next turn', async () => {
    let calls = 0;
    const slow: FetchLike = (_url, init) =>
      new Promise((resolve, reject) => {
        calls += 1;
        const n = calls;
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        setTimeout(() => resolve(json({ n })), 20);
      });
    const old = new AbortController();
    const opts = { provider: 'open-meteo', policy: STRICT, fetchImpl: slow, sleep: async () => undefined };
    const first = requestJson('https://api.open-meteo.com/v1/race', { ...opts, signal: old.signal });
    const second = requestJson<{ n: number }>('https://api.open-meteo.com/v1/race', opts);
    old.abort();
    expect(await first).toMatchObject({ ok: false, detail: 'cancelled' });
    expect(await second).toMatchObject({ ok: true, data: { n: 2 } });
  });
});

describe('live HTTP turn isolation', () => {
  const url = 'https://api.open-meteo.com/v1/test';
  const options = { provider: 'open-meteo', policy: STRICT };

  it('does not issue requests after a deadline has expired', async () => {
    const fetchImpl = vi.fn<FetchLike>();
    expect(await requestJson(url, { ...options, fetchImpl, deadlineAt: Date.now() - 1 })).toMatchObject({ ok: false, code: 'timeout' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('cancels a response-body read even when a transport ignores abort', async () => {
    const abort = new AbortController();
    const text = vi.fn(() => new Promise<string>(() => undefined));
    const fetchImpl = vi.fn<FetchLike>(async () => ({ ok: true, status: 200, text } as unknown as Response));
    const pending = requestJson(url, { ...options, fetchImpl, signal: abort.signal });
    await vi.waitFor(() => expect(text).toHaveBeenCalled());
    abort.abort();
    expect(await pending).toMatchObject({ ok: false, detail: 'cancelled' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not share a previous turn's request with the new turn", async () => {
    const old = new AbortController();
    const current = new AbortController();
    let calls = 0;
    const fetchImpl = vi.fn<FetchLike>(() => ++calls === 1
      ? new Promise(() => undefined) : Promise.resolve(json({ fresh: true })));
    const first = requestJson(url, { ...options, signal: old.signal, fetchImpl });
    const second = requestJson(url, { ...options, signal: current.signal, fetchImpl });
    old.abort();
    expect(await first).toMatchObject({ ok: false, detail: 'cancelled' });
    expect(await second).toMatchObject({ ok: true, data: { fresh: true } });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('enforces read slots on the actual network path and releases them', async () => {
    const { VoiceSessionController } = await import('@/lib/voice/voiceSession');
    const session = new VoiceSessionController();
    const turn = session.beginTurn();
    let release!: (response: Response) => void;
    const fetchImpl = vi.fn<FetchLike>(() => new Promise((resolve) => { release = resolve; }));
    const context = { ...options, signal: turn.signal, reserveRead: () => session.reserveRead(turn.turnId), fetchImpl };
    const a = requestJson(url + 'a', context);
    const b = requestJson(url + 'b', context);
    expect(await requestJson(url + 'c', context)).toMatchObject({ ok: false, detail: 'read budget exceeded' });
    session.cancel();
    await Promise.all([a, b]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    // The transport can finish later without delivering its obsolete result.
    release(json({ old: true }));
  });
});
