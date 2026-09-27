/**
 * Choosing a voice that does not sound like a robot.
 *
 * The previous selection was `find(quality === 'Enhanced') ?? candidates[0]`.
 * On Android that is close to random. Android reports `quality` as `Default`
 * for almost everything, including Google's good neural voices, so the filter
 * almost never matched and the fallback took whatever the platform happened to
 * enumerate first — frequently the compact eSpeak-class voice that is the
 * reason the assistant sounded synthetic.
 *
 * What actually distinguishes the voices on an Android device is the
 * identifier. Google's text-to-speech engine names its voices
 * `<lang>-x-<3 letters>-<local|network>`, e.g. `en-gb-x-rjs-local` or
 * `ar-xa-x-arc-network`. Those are the neural ones. A bare `en-GB-language`,
 * or anything from `espeak`/`pico`/`svox`, is the old formant synthesiser.
 *
 * `-network` voices are synthesised server-side and are the best sounding, but
 * they need internet and add round-trip latency. JARVIS is local-first, so a
 * local neural voice wins by default and network voices are opt-in.
 *
 * Pure and dependency-free so the ranking is unit-tested off-device.
 */

export interface DeviceVoice {
  identifier: string;
  name: string;
  quality: string;
  language: string;
}

export interface VoiceSelectionOptions {
  /** 'en' prefers en-GB; 'ar' prefers any Arabic locale. */
  language: 'en' | 'ar';
  /**
   * Allow Google's server-synthesised `-network` voices. Best sounding, but
   * they need connectivity and add latency, so this is off unless the owner
   * turns it on and the device is actually online.
   */
  allowNetwork?: boolean;
  /** An exact identifier the owner pinned. Honoured if still installed. */
  preferredIdentifier?: string;
}

export interface RankedVoice {
  voice: DeviceVoice;
  score: number;
  /** Why this voice scored as it did — shown in Settings, not invented. */
  reason: string;
}

/** Engines whose output is formant synthesis: the classic robot voice. */
const LEGACY_ENGINES = /espeak|pico|svox|klatt|flite/i;

/** Google's neural voice identifier shape. */
const GOOGLE_NEURAL = /-x-[a-z]{2,4}-(local|network)$/i;

function normalise(value: string): string {
  return value.trim().toLowerCase();
}

function languageMatches(voice: DeviceVoice, language: 'en' | 'ar'): boolean {
  return normalise(voice.language).startsWith(language);
}

/**
 * Score one voice. Higher is better; a negative score means "only if there is
 * genuinely nothing else".
 */
export function scoreVoice(voice: DeviceVoice, options: VoiceSelectionOptions): RankedVoice {
  const identifier = normalise(voice.identifier);
  const name = normalise(voice.name);
  const language = normalise(voice.language);
  const reasons: string[] = [];
  let score = 0;

  if (LEGACY_ENGINES.test(identifier) || LEGACY_ENGINES.test(name)) {
    score -= 100;
    reasons.push('legacy formant engine');
  }

  const neural = GOOGLE_NEURAL.test(identifier);
  if (neural) {
    score += 50;
    reasons.push('neural voice');
  } else {
    reasons.push('basic platform voice');
  }

  const isNetwork = identifier.endsWith('-network');
  if (isNetwork) {
    if (options.allowNetwork) {
      score += 15;
      reasons.push('server-synthesised, highest quality');
    } else {
      // Not disqualified: if the device has nothing else, a network voice
      // that fails offline is still better than no voice at all.
      score -= 40;
      reasons.push('needs internet, not preferred offline');
    }
  } else if (neural) {
    score += 10;
    reasons.push('on-device, works offline');
  }

  if (normalise(voice.quality) === 'enhanced') {
    score += 20;
    reasons.push('reported as enhanced');
  }

  // Region preference. en-GB is the register this assistant is written in;
  // Arabic has no single "best" locale, so ar-XA (Google's multi-region
  // Arabic) is preferred and any other Arabic locale is still accepted.
  if (options.language === 'en') {
    if (language.startsWith('en-gb') || identifier.startsWith('en-gb')) {
      score += 12;
      reasons.push('en-GB');
    } else if (language.startsWith('en')) {
      score += 4;
      reasons.push('English, other region');
    }
  } else if (language.startsWith('ar-xa') || identifier.startsWith('ar-xa')) {
    score += 12;
    reasons.push('ar-XA');
  } else if (language.startsWith('ar')) {
    score += 6;
    reasons.push('Arabic, other region');
  }

  return { voice, score, reason: reasons.join(' · ') };
}

/**
 * Rank every installed voice for the requested language, best first.
 *
 * Ties break on identifier so the ranking is stable across launches: a voice
 * that changes between runs reads as a fault, not as variety.
 */
export function rankVoices(voices: DeviceVoice[], options: VoiceSelectionOptions): RankedVoice[] {
  return voices
    .filter((voice) => languageMatches(voice, options.language))
    .map((voice) => scoreVoice(voice, options))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.voice.identifier.localeCompare(right.voice.identifier);
    });
}

/**
 * The voice to speak with, or undefined when the device has nothing for this
 * language — in which case the caller must let the platform pick by language
 * code rather than forcing an identifier that does not exist.
 */
export function selectVoice(voices: DeviceVoice[], options: VoiceSelectionOptions): RankedVoice | undefined {
  if (options.preferredIdentifier) {
    const pinned = voices.find((voice) => voice.identifier === options.preferredIdentifier);
    if (pinned) {
      return { voice: pinned, score: Number.POSITIVE_INFINITY, reason: 'pinned by owner in Settings' };
    }
    // A pinned voice that is no longer installed must not silently stay
    // selected; fall through and rank, so Settings shows what is really used.
  }

  return rankVoices(voices, options)[0];
}

/**
 * Prosody per voice family. A neural voice sounds natural near its own
 * baseline; the legacy engine needs slowing down to stay intelligible. These
 * are presentation defaults, not claims about the engine.
 */
export function prosodyFor(voice: DeviceVoice | undefined, language: 'en' | 'ar'): { rate: number; pitch: number } {
  const neural = voice ? GOOGLE_NEURAL.test(voice.identifier) : false;

  if (!neural) {
    // Slower and flatter: the compact engine garbles at speed.
    return { rate: language === 'ar' ? 0.92 : 0.88, pitch: 1.0 };
  }

  // Just under natural pace reads as considered rather than hurried, and a
  // slightly lowered pitch suits the register. Arabic is left at natural
  // pitch: lowering it muddies the emphatic consonants.
  return language === 'ar' ? { rate: 0.98, pitch: 1.0 } : { rate: 0.96, pitch: 0.96 };
}
