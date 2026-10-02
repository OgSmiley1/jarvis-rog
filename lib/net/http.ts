import { checkProvider, recordPolicy, type PolicySettings } from './providerPolicy';

/**
 * The only way JARVIS's live-data tools reach the network.
 *
 * - Policy first: a refused provider never sees a request.
 * - Four-second timeout by default, and the turn's own AbortSignal.
 * - One retry, only for idempotent GETs, only on timeout / 429 / 5xx, only
 *   if the turn's deadline leaves room; backoff honours Retry-After.
 * - Malformed requests and missing credentials are never retried.
 * - A circuit breaker stops hammering a provider that keeps failing.
 * - Identical GETs already in flight share one request.
 *
 * Returns a discriminated result instead of throwing, so a failure is always
 * something the caller has to handle, and can be spoken honestly.
 */

export type FailureCode = 'offline' | 'timeout' | 'rate-limited' | 'invalid-input' | 'unavailable' | 'blocked';

export type HttpResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; code: FailureCode; retryAfterMs?: number; detail?: string };

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface RequestOptions {
  provider: string;
  policy: PolicySettings;
  method?: 'GET' | 'POST';
  body?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Absolute epoch-ms deadline shared by the whole turn. */
  deadlineAt?: number;
  fetchImpl?: FetchLike;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export const DEFAULT_TIMEOUT_MS = 4_000;
const BREAKER_THRESHOLD = 3;
const BREAKER_OPEN_MS = 60_000;
const MAX_RESPONSE_CHARS = 512_000;

const breakers = new Map<string, { failures: number; openUntil: number }>();
const inFlight = new Map<string, Promise<HttpResult<unknown>>>();

export function resetHttpState(): void {
  breakers.clear();
  inFlight.clear();
}

function breakerOpen(provider: string, now: number): boolean {
  const state = breakers.get(provider);
  return Boolean(state && state.openUntil > now);
}

function noteOutcome(provider: string, ok: boolean, now: number): void {
  if (ok) {
    breakers.delete(provider);
    return;
  }
  const state = breakers.get(provider) ?? { failures: 0, openUntil: 0 };
  state.failures += 1;
  if (state.failures >= BREAKER_THRESHOLD) {
    state.openUntil = now + BREAKER_OPEN_MS;
    state.failures = 0;
  }
  breakers.set(provider, state);
}

/** Retry-After as seconds or an HTTP date; capped so a hostile value cannot stall a turn. */
export function parseRetryAfter(value: string | null, now: number): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.min(Math.max(0, seconds * 1000), 60_000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.min(Math.max(0, date - now), 60_000);
}

function looksOffline(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /network request failed|failed to fetch|network|ENOTFOUND|ECONNREFUSED|EAI_AGAIN|Unable to resolve host/i.test(message);
}

async function attempt<T>(url: string, options: RequestOptions, timeoutMs: number): Promise<HttpResult<T>> {
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as FetchLike);
  const controller = new AbortController();
  const onOuterAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onOuterAbort);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: options.method ?? 'GET',
      headers: { Accept: 'application/json', ...options.headers },
      body: options.body,
      signal: controller.signal,
    });
    const now = (options.now ?? Date.now)();
    if (response.status === 429) {
      return { ok: false, code: 'rate-limited', retryAfterMs: parseRetryAfter(response.headers.get('retry-after'), now) };
    }
    if (response.status === 401 || response.status === 403) return { ok: false, code: 'invalid-input', detail: `HTTP ${response.status}` };
    if (response.status >= 400 && response.status < 500) return { ok: false, code: 'invalid-input', detail: `HTTP ${response.status}` };
    if (!response.ok) return { ok: false, code: 'unavailable', detail: `HTTP ${response.status}` };
    const text = await response.text();
    if (text.length > MAX_RESPONSE_CHARS) return { ok: false, code: 'unavailable', detail: 'response too large' };
    try {
      return { ok: true, data: JSON.parse(text) as T, status: response.status };
    } catch {
      return { ok: false, code: 'unavailable', detail: 'malformed JSON' };
    }
  } catch (error) {
    if (options.signal?.aborted) return { ok: false, code: 'unavailable', detail: 'cancelled' };
    if (timedOut) return { ok: false, code: 'timeout' };
    return { ok: false, code: looksOffline(error) ? 'offline' : 'unavailable', detail: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onOuterAbort);
  }
}

const retryable = (code: FailureCode) => code === 'timeout' || code === 'rate-limited' || code === 'unavailable';

async function run<T>(url: string, options: RequestOptions): Promise<HttpResult<T>> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const idempotent = (options.method ?? 'GET') === 'GET';

  let result = await attempt<T>(url, options, timeoutMs);
  if (!result.ok && idempotent && retryable(result.code) && !options.signal?.aborted && result.detail !== 'cancelled') {
    const base = result.retryAfterMs ?? 400 + Math.floor(Math.random() * 300);
    const remaining = (options.deadlineAt ?? Infinity) - now();
    // Only retry when the wait plus a full attempt still fits the turn.
    if (base + timeoutMs <= remaining) {
      await sleep(base);
      if (!options.signal?.aborted) result = await attempt<T>(url, options, timeoutMs);
    }
  }
  if (!(!result.ok && result.detail === 'cancelled')) noteOutcome(options.provider, result.ok, now());
  return result;
}

/** A JSON request to a named provider, under the zero-cost policy. */
export async function requestJson<T = unknown>(url: string, options: RequestOptions): Promise<HttpResult<T>> {
  const now = (options.now ?? Date.now)();
  const decision = checkProvider(options.provider, options.policy, now);
  recordPolicy(options.provider, decision.allowed, now);
  if (!decision.allowed) return { ok: false, code: 'blocked', detail: decision.reason };
  if (!url.startsWith(`https://${decision.provider.host}/`)) {
    return { ok: false, code: 'blocked', detail: `URL does not belong to ${decision.provider.name}` };
  }
  if (breakerOpen(options.provider, now)) return { ok: false, code: 'unavailable', detail: 'circuit open' };

  const idempotent = (options.method ?? 'GET') === 'GET';
  if (!idempotent) return run<T>(url, options);
  const existing = inFlight.get(url);
  if (existing) {
    const shared = (await existing) as HttpResult<T>;
    // The request we joined belonged to a turn that was cancelled; ours was
    // not, so it gets a fresh request rather than someone else's "cancelled".
    if (!shared.ok && shared.detail === 'cancelled' && !options.signal?.aborted) return requestJson<T>(url, options);
    return shared;
  }
  const pending = run<T>(url, options).finally(() => inFlight.delete(url));
  inFlight.set(url, pending as Promise<HttpResult<unknown>>);
  return pending;
}
