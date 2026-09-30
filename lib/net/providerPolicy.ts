/**
 * AED 0, enforced in code.
 *
 * Every network or AI adapter names its provider and asks this module before
 * it sends a byte. A "free-only" switch that nothing checks is not a policy;
 * this is. Strict mode — the default — allows on-device work and providers
 * verified free-with-limits. A provider that is not in the manifest is
 * `unknown` and is refused: the policy fails closed.
 *
 * The manifest records, for each provider, where its terms live, when they
 * were checked, what it needs, its limits, what the owner must credit, and
 * what JARVIS does when it is unavailable. Nothing here is a claim that a
 * service is up — only what it costs and what it is allowed to do.
 */

export type RouteClass = 'local' | 'verified-free-with-limits' | 'user-pays' | 'paid' | 'unknown';

export interface ProviderEntry {
  id: string;
  name: string;
  class: RouteClass;
  host: string;
  termsUrl: string;
  checked: string;
  auth: 'none' | 'free-key' | 'account';
  limits: string;
  attribution?: string;
  fallback: string;
  /** The free tier may use prompts for training; needs its own switch. */
  trainsOnPrompts?: boolean;
}

const CHECKED = '2026-09-30';

export const PROVIDERS: Record<string, ProviderEntry> = {
  'open-meteo': {
    id: 'open-meteo', name: 'Open-Meteo', class: 'verified-free-with-limits', host: 'api.open-meteo.com',
    termsUrl: 'https://open-meteo.com/en/terms', checked: CHECKED, auth: 'none',
    limits: 'Non-commercial; under 10,000 calls/day', attribution: 'Weather data by Open-Meteo.com (CC BY 4.0)',
    fallback: 'Cached observation with its age, or "live weather unavailable"',
  },
  'open-meteo-geocoding': {
    id: 'open-meteo-geocoding', name: 'Open-Meteo Geocoding', class: 'verified-free-with-limits', host: 'geocoding-api.open-meteo.com',
    termsUrl: 'https://open-meteo.com/en/terms', checked: CHECKED, auth: 'none',
    limits: 'Non-commercial; shares the Open-Meteo daily limit', attribution: 'Place data by Open-Meteo.com / GeoNames (CC BY 4.0)',
    fallback: 'Built-in city table; otherwise ask which city',
  },
  aladhan: {
    id: 'aladhan', name: 'Aladhan', class: 'verified-free-with-limits', host: 'api.aladhan.com',
    termsUrl: 'https://aladhan.com/prayer-times-api', checked: CHECKED, auth: 'none',
    limits: 'Free public API; fair use', fallback: "Cached schedule for the same date only",
  },
  'quran-cloud': {
    id: 'quran-cloud', name: 'Al Quran Cloud', class: 'verified-free-with-limits', host: 'api.alquran.cloud',
    termsUrl: 'https://alquran.cloud/api', checked: CHECKED, auth: 'none',
    limits: 'Free public API; fair use', fallback: 'Verified cached verse, or unavailable — never generated text',
  },
  geojs: {
    id: 'geojs', name: 'GeoJS', class: 'verified-free-with-limits', host: 'get.geojs.io',
    termsUrl: 'https://www.geojs.io/', checked: CHECKED, auth: 'none',
    limits: 'Approximate IP location; opt-in only', fallback: 'Last selected city',
  },
  guardian: {
    id: 'guardian', name: 'The Guardian Open Platform', class: 'verified-free-with-limits', host: 'content.guardianapis.com',
    termsUrl: 'https://open-platform.theguardian.com/access/', checked: CHECKED, auth: 'free-key',
    limits: 'Free developer key, non-commercial, 1 call/s, 500 calls/day', attribution: 'Headlines from The Guardian',
    fallback: 'Dated cached headlines, or unavailable',
  },
  spaceflight: {
    id: 'spaceflight', name: 'Spaceflight News', class: 'verified-free-with-limits', host: 'api.spaceflightnewsapi.net',
    termsUrl: 'https://api.spaceflightnewsapi.net/v4/docs/', checked: CHECKED, auth: 'none',
    limits: 'Free; space news only', fallback: 'Unavailable',
  },
  jokeapi: {
    id: 'jokeapi', name: 'JokeAPI', class: 'verified-free-with-limits', host: 'v2.jokeapi.dev',
    termsUrl: 'https://v2.jokeapi.dev/', checked: CHECKED, auth: 'none',
    limits: '120 requests/minute; safe-mode used', fallback: 'Built-in joke collection',
  },
  zenquotes: {
    id: 'zenquotes', name: 'ZenQuotes', class: 'verified-free-with-limits', host: 'zenquotes.io',
    termsUrl: 'https://zenquotes.io/', checked: CHECKED, auth: 'none',
    limits: '5 requests / 30 s; attribution required', attribution: 'Inspirational quotes provided by ZenQuotes API',
    fallback: 'Built-in unattributed lines',
  },
  groq: {
    id: 'groq', name: 'Groq', class: 'verified-free-with-limits', host: 'api.groq.com',
    termsUrl: 'https://console.groq.com/docs/rate-limits', checked: CHECKED, auth: 'free-key',
    limits: 'Free tier rate limits; no card', fallback: 'Local brain',
  },
  cerebras: {
    id: 'cerebras', name: 'Cerebras', class: 'verified-free-with-limits', host: 'api.cerebras.ai',
    termsUrl: 'https://inference-docs.cerebras.ai/support/rate-limits', checked: CHECKED, auth: 'free-key',
    limits: 'Free tier rate limits; no card', fallback: 'Local brain',
  },
  gemini: {
    id: 'gemini', name: 'Google Gemini', class: 'verified-free-with-limits', host: 'generativelanguage.googleapis.com',
    termsUrl: 'https://ai.google.dev/gemini-api/terms', checked: CHECKED, auth: 'free-key',
    limits: 'Free tier; prompts may be used to improve products', fallback: 'Local brain', trainsOnPrompts: true,
  },
  puter: {
    id: 'puter', name: 'Puter', class: 'user-pays', host: 'puter.com',
    termsUrl: 'https://docs.puter.com/', checked: CHECKED, auth: 'account',
    limits: 'User-pays with a free monthly allowance; asks to upgrade when it runs out',
    fallback: 'Local brain — never an upgrade prompt mid-conversation',
  },
  github: {
    id: 'github', name: 'GitHub (owner\'s live test link)', class: 'verified-free-with-limits', host: 'api.github.com',
    termsUrl: 'https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api', checked: CHECKED, auth: 'account',
    limits: '5,000 requests/hour per token; only while the owner has the live link on', fallback: 'Live log stays on the phone',
  },
  huggingface: {
    id: 'huggingface', name: 'Hugging Face (one-time model downloads)', class: 'verified-free-with-limits', host: 'huggingface.co',
    termsUrl: 'https://huggingface.co/terms-of-service', checked: CHECKED, auth: 'none',
    limits: 'Public model files; downloaded once into Download/JARVIS', fallback: 'Models already on the phone',
  },
  termux: {
    id: 'termux', name: 'Termux bridge (this phone)', class: 'local', host: '127.0.0.1:8765',
    termsUrl: 'https://termux.dev/', checked: CHECKED, auth: 'account',
    limits: 'Loopback only; never leaves the phone', fallback: 'Android intents',
  },
  libretranslate: {
    id: 'libretranslate', name: 'LibreTranslate public instance', class: 'unknown', host: 'libretranslate.com',
    termsUrl: 'https://libretranslate.com/', checked: CHECKED, auth: 'none',
    limits: 'Public instance not guaranteed keyless or available', fallback: 'Translation unavailable',
  },
};

export interface PolicySettings {
  /** Strict zero-cost mode. Default on. */
  strict: boolean;
  /** Owner consented to Puter's user-pays model. */
  puterConsent?: boolean;
  /** Puter reported the allowance ran out at this time (epoch ms). */
  puterExhaustedAt?: number;
  /** Owner allows a free tier that may train on prompts. */
  allowTraining?: boolean;
  /** Owner allowed approximate IP location. */
  ipLocation?: boolean;
}

export type PolicyDecision = { allowed: true; provider: ProviderEntry } | { allowed: false; reason: string };

const MONTH_MS = 31 * 24 * 60 * 60 * 1000;

/**
 * May JARVIS call this provider now? Unknown and paid are always refused.
 * User-pays (Puter) needs explicit consent and is stopped hard once its
 * allowance has run out, until the next month.
 */
export function checkProvider(id: string, settings: PolicySettings, now = Date.now()): PolicyDecision {
  const provider = PROVIDERS[id];
  if (!provider || provider.class === 'unknown') return { allowed: false, reason: `unknown provider "${id}" — refused` };
  if (provider.class === 'paid') return { allowed: false, reason: `${provider.name} is paid — refused` };
  if (provider.class === 'user-pays') {
    if (settings.strict) return { allowed: false, reason: `${provider.name} is user-pays — off in strict zero-cost mode` };
    if (!settings.puterConsent) return { allowed: false, reason: `${provider.name} needs your explicit opt-in` };
    if (settings.puterExhaustedAt && now - settings.puterExhaustedAt < MONTH_MS) {
      return { allowed: false, reason: `${provider.name} free allowance used up — stopped, no upgrade` };
    }
  }
  if (provider.trainsOnPrompts && !settings.allowTraining) {
    return { allowed: false, reason: `${provider.name} free tier may train on prompts — needs its own switch` };
  }
  if (id === 'geojs' && !settings.ipLocation) return { allowed: false, reason: 'IP location is opt-in' };
  return { allowed: true, provider };
}

/** Which provider a URL belongs to, by exact host. Null means unknown. */
export function providerForUrl(url: string): ProviderEntry | null {
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return null;
  }
  return Object.values(PROVIDERS).find((provider) => provider.host === host) ?? null;
}

/** Puter says "out of allowance" in several ways; any of them is a hard stop. */
export function isAllowanceExhausted(message: string): boolean {
  return /insufficient|allowance|quota|out of (?:credits|funds)|upgrade|payment required|402/i.test(message);
}

/** Every counted request, for the zero-cost audit: which provider, allowed or not. */
const audit: { at: number; provider: string; allowed: boolean }[] = [];
export function recordPolicy(provider: string, allowed: boolean, at = Date.now()): void {
  audit.push({ at, provider, allowed });
  if (audit.length > 1000) audit.shift();
}
export function policyAudit(): readonly { at: number; provider: string; allowed: boolean }[] {
  return audit;
}
