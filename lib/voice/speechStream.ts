/**
 * Streaming speech segmentation — the single biggest latency win available
 * without spending anything.
 *
 * Before this, JARVIS generated the whole answer, then started speaking. The
 * owner heard nothing for the full generation. On a 4B model producing a
 * six-sentence answer on a phone, that is most of a minute of silence, and it
 * is what makes a local assistant feel dead next to a hosted one.
 *
 * This cuts the token stream at sentence boundaries and hands each finished
 * sentence to TTS while the model is still writing the next one. Time-to-first
 * word drops from "the whole answer" to "the first sentence", and the voice
 * then stays ahead of the generator, because speaking a sentence takes longer
 * than generating one. Nothing is faked: a sentence is only released once its
 * terminator has actually arrived in the stream.
 *
 * Pure and synchronous, so the whole thing is unit-testable off-device.
 */

/** Sentence terminators, Latin and Arabic (؟ ؛ ، are the Arabic forms). */
const TERMINATORS = new Set(['.', '!', '?', '…', '؟', '!', '۔', '\n']);

/**
 * Abbreviations whose trailing dot is not a sentence end. Kept short and
 * lowercase; anything longer is a judgement call a bigger list would get
 * wrong more often than right.
 */
const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st',
  'e.g', 'i.e', 'etc', 'vs', 'approx', 'no',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
]);

export interface SpeechStreamOptions {
  /**
   * Minimum characters before the FIRST sentence may be released. Small on
   * purpose: the first utterance is what the owner is waiting for.
   */
  minFirstChars?: number;
  /**
   * Minimum characters for later sentences. Larger, so a run of three-word
   * sentences does not turn into three separate TTS utterances with a gap
   * between each.
   */
  minChars?: number;
  /**
   * Release at the last word break once a segment gets this long without any
   * terminator, so a model that forgets punctuation still produces speech.
   */
  maxChars?: number;
}

/**
 * Text the TTS engine should never pronounce. Models leak markdown even when
 * told not to, and "asterisk asterisk important asterisk asterisk" is the
 * fastest way to make a voice assistant sound broken.
 */
export function stripForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|\*|_)/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/\|/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function endsWithAbbreviation(segment: string): boolean {
  const match = segment.match(/([A-Za-z.]+)\.$/);
  if (!match?.[1]) return false;
  return ABBREVIATIONS.has(match[1].toLowerCase().replace(/\.$/, ''));
}

/** A dot between digits is a decimal or a version, not a full stop. */
function isInsideNumber(segment: string, next: string): boolean {
  const previous = segment[segment.length - 2];
  return previous !== undefined && /\d/.test(previous) && /\d/.test(next);
}

export class SpeechStream {
  private buffer = '';
  private released = 0;
  private readonly minFirstChars: number;
  private readonly minChars: number;
  private readonly maxChars: number;

  constructor(options: SpeechStreamOptions = {}) {
    this.minFirstChars = options.minFirstChars ?? 8;
    this.minChars = options.minChars ?? 24;
    this.maxChars = options.maxChars ?? 220;
  }

  /** Feed one token (or any fragment). Returns utterances ready to speak now. */
  push(token: string): string[] {
    if (!token) return [];
    this.buffer += token;
    return this.drain(false);
  }

  /** End of generation: release whatever is left, however short. */
  flush(): string[] {
    const ready = this.drain(true);
    const remainder = stripForSpeech(this.buffer);
    this.buffer = '';
    if (remainder) {
      this.released += 1;
      ready.push(remainder);
    }
    return ready;
  }

  /** Abandon everything unspoken — used by barge-in. */
  reset(): void {
    this.buffer = '';
    this.released = 0;
  }

  private threshold(): number {
    return this.released === 0 ? this.minFirstChars : this.minChars;
  }

  private drain(final: boolean): string[] {
    const ready: string[] = [];

    for (;;) {
      const cut = this.findCut(final);
      if (cut === null) break;

      const raw = this.buffer.slice(0, cut);
      this.buffer = this.buffer.slice(cut);
      const spoken = stripForSpeech(raw);
      if (spoken) {
        this.released += 1;
        ready.push(spoken);
      }
    }

    return ready;
  }

  /** Index to cut at, or null when nothing is releasable yet. */
  private findCut(final: boolean): number | null {
    for (let index = 0; index < this.buffer.length; index += 1) {
      const character = this.buffer[index];
      if (character === undefined || !TERMINATORS.has(character)) continue;

      const segment = this.buffer.slice(0, index + 1);
      const next = this.buffer[index + 1];

      // A terminator with nothing after it might still be mid-token ("3." of
      // "3.5"), so wait for the next character unless generation has ended.
      if (next === undefined && !final) return null;
      if (next !== undefined && isInsideNumber(segment, next)) continue;
      if (endsWithAbbreviation(segment.trimEnd())) continue;

      // Run the terminator out: "..." and "?!" are one boundary, not three.
      let end = index + 1;
      while (end < this.buffer.length) {
        const following = this.buffer[end];
        if (following === undefined || !TERMINATORS.has(following)) break;
        end += 1;
      }

      if (stripForSpeech(this.buffer.slice(0, end)).length < this.threshold() && !final) continue;
      return end;
    }

    // No terminator in sight and the segment is getting long: cut at a word
    // break so the owner hears something rather than waiting for punctuation
    // that may never come.
    if (this.buffer.length >= this.maxChars) {
      const breakAt = this.buffer.lastIndexOf(' ', this.maxChars);
      if (breakAt > this.threshold()) return breakAt + 1;
    }

    return null;
  }
}
