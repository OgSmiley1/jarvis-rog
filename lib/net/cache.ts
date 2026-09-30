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

/** Calendar date (YYYY-MM-DD) of `now` in `timeZone`; device local time if the zone is unusable. */
export function localDate(now: number, timeZone?: string): string {
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
      if (/^\d{4}-\d{2}-\d{2}$/.test(parts)) return parts;
    } catch {
      // Fall through to the device's own zone.
    }
  }
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
