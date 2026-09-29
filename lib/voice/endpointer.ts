/**
 * Knows when the owner starts and stops talking, so a turn ends by itself —
 * no Stop button.
 *
 * Each microphone frame (16 kHz mono float) gets a speech score from its
 * loudness above a noise floor that adapts to the room. A hysteresis state
 * machine turns scores into utterances:
 * - opens at score ≥ 0.5 held for 250 ms (a click or a cough is too short);
 * - closes at score < 0.35 held for 800 ms of trailing silence, and the end is
 *   backdated to the last speech frame so the silence is not sent;
 * - keeps 250 ms of audio from before the open (pre-roll), so the first
 *   syllable is never cut off;
 * - a 15 s utterance is ended anyway.
 *
 * Pure: frames in, events out, time measured in samples. The score source is
 * one function (`speechScore`), so a neural VAD can replace the energy
 * detector later without touching the state machine.
 */

export const SAMPLE_RATE = 16_000;

export interface EndpointerOptions {
  openScore: number;
  closeScore: number;
  minSpeechMs: number;
  endSilenceMs: number;
  preRollMs: number;
  maxUtteranceMs: number;
}

export const DEFAULT_ENDPOINTER: EndpointerOptions = {
  openScore: 0.5,
  closeScore: 0.35,
  minSpeechMs: 250,
  endSilenceMs: 800,
  preRollMs: 250,
  maxUtteranceMs: 15_000,
};

export type EndpointEvent =
  | { type: 'start' }
  | { type: 'end'; audio: Float32Array; speechMs: number }
  /** Opened, then fell silent before it was long enough to be speech. */
  | { type: 'discard' };

export function rms(frame: Float32Array): number {
  if (frame.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < frame.length; i += 1) sum += frame[i]! * frame[i]!;
  return Math.sqrt(sum / frame.length);
}

const db = (value: number) => 20 * Math.log10(Math.max(value, 1e-6));

/** 0 at 6 dB above the noise floor, 1 at 18 dB above. */
export function speechScore(level: number, noiseFloor: number): number {
  const above = db(level) - db(noiseFloor);
  return Math.max(0, Math.min(1, (above - 6) / 12));
}

const ms = (samples: number) => (samples / SAMPLE_RATE) * 1000;

export class Endpointer {
  private noiseFloor = 0.003;
  private open = false;
  private candidateSamples = 0;
  private silenceSamples = 0;
  private speechSamples = 0;
  private preRoll: Float32Array[] = [];
  private preRollSamples = 0;
  private utterance: Float32Array[] = [];
  private utteranceSamples = 0;
  /** Samples of the utterance up to the last frame that was speech. */
  private lastSpeechEnd = 0;

  constructor(private readonly options: EndpointerOptions = DEFAULT_ENDPOINTER) {}

  get inSpeech(): boolean {
    return this.open;
  }

  get floor(): number {
    return this.noiseFloor;
  }

  push(frame: Float32Array): EndpointEvent[] {
    const events: EndpointEvent[] = [];
    const level = rms(frame);
    const score = speechScore(level, this.noiseFloor);
    const { options } = this;

    if (!this.open) {
      // The room's own noise sets the floor, slowly, and only between utterances.
      if (score < options.closeScore) this.noiseFloor = this.noiseFloor * 0.95 + level * 0.05;
      this.remember(frame);
      if (score >= options.openScore) {
        this.candidateSamples += frame.length;
        if (ms(this.candidateSamples) >= options.minSpeechMs) {
          this.open = true;
          this.utterance = [...this.preRoll];
          this.utteranceSamples = this.preRollSamples;
          this.lastSpeechEnd = this.utteranceSamples;
          this.speechSamples = this.candidateSamples;
          this.silenceSamples = 0;
          this.preRoll = [];
          this.preRollSamples = 0;
          events.push({ type: 'start' });
        }
      } else {
        this.candidateSamples = 0;
      }
      return events;
    }

    this.utterance.push(frame);
    this.utteranceSamples += frame.length;
    if (score >= options.closeScore) {
      this.silenceSamples = 0;
      this.speechSamples += frame.length;
      this.lastSpeechEnd = this.utteranceSamples;
    } else {
      this.silenceSamples += frame.length;
    }

    const ended = ms(this.silenceSamples) >= options.endSilenceMs;
    const tooLong = ms(this.utteranceSamples) >= options.maxUtteranceMs;
    if (ended || tooLong) {
      const audio = concat(this.utterance, tooLong ? this.utteranceSamples : this.lastSpeechEnd);
      const speechMs = ms(this.speechSamples);
      this.close();
      events.push(speechMs >= options.minSpeechMs ? { type: 'end', audio, speechMs } : { type: 'discard' });
    }
    return events;
  }

  /** Drops any utterance in progress (a turn was cancelled). */
  reset(): void {
    this.close();
    this.preRoll = [];
    this.preRollSamples = 0;
  }

  private close(): void {
    this.open = false;
    this.candidateSamples = 0;
    this.silenceSamples = 0;
    this.speechSamples = 0;
    this.utterance = [];
    this.utteranceSamples = 0;
    this.lastSpeechEnd = 0;
  }

  private remember(frame: Float32Array): void {
    this.preRoll.push(frame);
    this.preRollSamples += frame.length;
    // Room for the pre-roll AND the frames that are still proving to be
    // speech, so the audio before the open is really kept.
    const limit = ((this.options.preRollMs + this.options.minSpeechMs) / 1000) * SAMPLE_RATE + frame.length;
    while (this.preRollSamples > limit && this.preRoll.length > 1) {
      this.preRollSamples -= this.preRoll.shift()!.length;
    }
  }
}

function concat(frames: Float32Array[], samples: number): Float32Array {
  const out = new Float32Array(samples);
  let offset = 0;
  for (const frame of frames) {
    if (offset >= samples) break;
    const take = Math.min(frame.length, samples - offset);
    out.set(frame.subarray(0, take), offset);
    offset += take;
  }
  return out;
}

/** 16 kHz float [-1, 1] to 16-bit PCM, the format the wake-word engine takes. */
export function toInt16(frame: Float32Array): Int16Array {
  const out = new Int16Array(frame.length);
  for (let i = 0; i < frame.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, frame[i]!));
    out[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return out;
}
