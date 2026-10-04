/**
 * The live-data cache.
 *
 * Every entry records where it came from, when it was fetched and until when
 * it is valid, so an answer from the cache can say its age — and a prayer
 * schedule for yesterday can never be read out as today's. Keys carry every
 * parameter that changes the answer (city, coordinates, date, method…).
 *
 * Memory is bounded (least-recently-used eviction). A persistent store is
 * optional and injected, so the cache survives restarts on the phone and
 * stays a pure object in tests.
 */

export interface CacheEntry<T> {
  data: T;
  source: string;
  fetchedAt: number;
  /** After this, the entry is stale. Hard-expiring data also sets `expiresAt`. */
  validUntil: number;
  /** After this, the entry must not be used at all (e.g. a prayer schedule after its date). */
  expiresAt?: number;
}

export interface CacheStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export type Lookup<T> =
  | { hit: false }
  | { hit: true; entry: CacheEntry<T>; stale: boolean; ageMs: number };

const PREFIX = 'jarvis.cache:';

export class LiveCache {
  private readonly memory = new Map<string, CacheEntry<unknown>>();

  constructor(
    private readonly maxEntries = 120,
    private store?: CacheStore,
  ) {}

  attachStore(store: CacheStore): void {
    this.store = store;
  }

  async get<T>(key: string, now = Date.now()): Promise<Lookup<T>> {
    let entry = this.memory.get(key) as CacheEntry<T> | undefined;
    if (!entry && this.store) {
      try {
        const raw = await this.store.getItem(PREFIX + key);
        if (raw) entry = JSON.parse(raw) as CacheEntry<T>;
      } catch {
        entry = undefined;
      }
    }
    if (!entry) return { hit: false };
    if (entry.expiresAt !== undefined && now >= entry.expiresAt) {
      this.memory.delete(key);
      void this.store?.removeItem(PREFIX + key).catch(() => undefined);
      return { hit: false };
    }
    // Touch for LRU order.
    this.memory.delete(key);
    this.memory.set(key, entry);
    this.evict();
    return { hit: true, entry, stale: now >= entry.validUntil, ageMs: Math.max(0, now - entry.fetchedAt) };
  }

  async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    this.memory.delete(key);
    this.memory.set(key, entry);
    this.evict();
    try {
      await this.store?.setItem(PREFIX + key, JSON.stringify(entry));
    } catch {
      // A full disk costs a cache entry, never an answer.
    }
  }

  size(): number {
    return this.memory.size;
  }

  clear(): void {
    this.memory.clear();
  }

  private evict(): void {
    while (this.memory.size > this.maxEntries) {
      const oldest = this.memory.keys().next().value as string | undefined;
      if (oldest === undefined) return;
      this.memory.delete(oldest);
    }
  }
}

export const liveCache = new LiveCache();

/**
 * Standard UTC offsets (minutes) for the zones JARVIS knows by name. Used only
 * when the platform's Intl cannot format a zone: none of the Gulf zones use
 * daylight saving, so for them this is exact.
 */
const FIXED_OFFSETS: Record<string, number> = {
  'Asia/Dubai': 240,
  'Asia/Muscat': 240,
  'Asia/Riyadh': 180,
  'Asia/Qatar': 180,
  'Asia/Kuwait': 180,
  'Asia/Bahrain': 180,
  'Africa/Khartoum': 120,
};

export interface ZoneParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

let intlWorks: boolean | null = null;

/**
 * Wall-clock date and time of `now` in `timeZone`.
 *
 * Reads Intl through formatToParts (which Hermes implements) rather than
 * trusting a locale's default pattern, so it cannot be fooled by "30/09/2026"
 * vs "2026-09-30". If the zone cannot be formatted, a fixed offset for the
 * known DST-free zones is used; otherwise the phone's own zone.
 */
export function zoneParts(now: number, timeZone?: string, useIntl = true): ZoneParts {
  if (timeZone && useIntl && intlWorks !== false) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
      }).formatToParts(new Date(now));
      const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
      const result = { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') % 24, minute: get('minute') };
      if (Object.values(result).every(Number.isFinite) && result.year > 2000) {
        intlWorks = true;
        return result;
      }
    } catch {
      // Unknown zone, or no Intl zone data on this engine: fall through.
    }
  }
  const offset = timeZone ? FIXED_OFFSETS[timeZone] : undefined;
  if (offset !== undefined) {
    const d = new Date(now + offset * 60_000);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes() };
  }
  const d = new Date(now);
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), minute: d.getMinutes() };
}

/** Calendar date (YYYY-MM-DD) of `now` in `timeZone`. */
export function localDate(now: number, timeZone?: string, useIntl = true): string {
  const p = zoneParts(now, timeZone, useIntl);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/**
 * The instant the local date in `timeZone` next changes after `now`. Found by
 * stepping forward — correct across DST without a timezone database.
 */
export function nextLocalMidnight(now: number, timeZone?: string): number {
  const today = localDate(now, timeZone);
  let lo = now;
  let hi = now + 26 * 60 * 60 * 1000;
  if (localDate(hi, timeZone) === today) return hi;
  // Binary search to the second. The date is also part of every cache key,
  // so a lookup after midnight misses even inside that last second.
  while (hi - lo > 1_000) {
    const mid = Math.floor((lo + hi) / 2);
    if (localDate(mid, timeZone) === today) lo = mid;
    else hi = mid;
  }
  return hi;
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
