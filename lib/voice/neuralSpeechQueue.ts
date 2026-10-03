/**
 * Plays a neural voice sentence by sentence, while the model is still writing.
 *
 * The voice is Kokoro, running on-device through react-native-executorch — the
 * same runtime already doing speech recognition in this app. Kokoro turns one
 * piece of text into one buffer of 24 kHz PCM. That shapes everything here:
 *
 * - **Synthesis is serialised.** Kokoro's `forward` throws if called while it
 *   is already generating, so sentences are synthesised strictly one at a
 *   time, in order.
 * - **Playback overlaps synthesis.** Sentence 2 is synthesised while sentence
 *   1 is playing, so after the first sentence there is no gap to wait through.
 * - **Clips are scheduled back to back** against the audio clock, never on a
 *   timer, so they neither overlap nor leave silences between them.
 * - **It never goes silent.** If a sentence fails to synthesise, that sentence
 *   is spoken by the fallback (the phone's own voice) and the queue carries on.
 * - **Barge-in wins.** `stop()` cancels everything queued and everything
 *   already playing, and an in-flight synthesis result is discarded when it
 *   lands rather than played after the owner said stop.
 *
 * Pure: the synthesiser, the player and the fallback are injected, so the
 * scheduling is tested off-device.
 */

export interface ScheduledClip {
  /** Length of the clip in seconds. */
  duration: number;
  /** Called once when the clip finishes or is stopped. */
  onEnded(callback: () => void): void;
  stop(): void;
}

/** Kokoro's output rate. */
export const NEURAL_SAMPLE_RATE = 24_000;
/** One loudness value per 20 ms of audio. */
export const ENVELOPE_FRAME_S = 0.02;

/**
 * The loudness of a clip, 0..1, one value per 20 ms: RMS per frame, scaled so
 * normal speech sits around 0.5–0.9 and silence near 0. Measured from the very
 * samples that are played, so the Core moves with the voice it is hearing.
 */
export function speechEnvelope(samples: Float32Array, sampleRate = NEURAL_SAMPLE_RATE): Float32Array {
  const frame = Math.max(1, Math.round(sampleRate * ENVELOPE_FRAME_S));
  const out = new Float32Array(Math.ceil(samples.length / frame));
  for (let f = 0; f < out.length; f += 1) {
    let sum = 0;
    const start = f * frame;
    const end = Math.min(samples.length, start + frame);
    for (let i = start; i < end; i += 1) sum += samples[i]! * samples[i]!;
    const rms = Math.sqrt(sum / Math.max(1, end - start));
    out[f] = Math.min(1, rms * 4);
  }
  return out;
}

export interface NeuralPlayer {
  /** The audio clock, in seconds. */
  now(): number;
  /** Start `samples` at audio-clock time `at`. */
  schedule(samples: Float32Array, at: number): ScheduledClip;
}

export interface NeuralSpeechQueueOptions {
  synthesize: (text: string) => Promise<Float32Array>;
  player: NeuralPlayer;
  /** Speaks a sentence the neural voice could not. Must resolve when done. */
  fallback: (text: string) => Promise<void>;
  /** True while anything is being synthesised, playing, or waiting to. */
  onSpeakingChange?: (speaking: boolean) => void;
  /** Scheduled playback/fallback activity; not a measured amplitude envelope. */
  onPlaybackChange?: (playing: boolean) => void;
  /**
   * A tiny lead so the first clip is never scheduled in the audio clock's
   * past (which would clip its first syllable).
   */
  leadSeconds?: number;
}

export class NeuralSpeechQueue {
  private readonly pending: string[] = [];
  private readonly clips = new Set<ScheduledClip>();
  /** Loudness of every scheduled clip, by its start on the audio clock. */
  private readonly envelopes = new Map<ScheduledClip, { at: number; env: Float32Array }>();
  private nextStart = 0;
  private synthesising = false;
  private synthesisEpoch: number | null = null;
  private fallbackActive = 0;
  private epoch = 0;
  private speaking = false;
  private playing = false;

  constructor(private readonly options: NeuralSpeechQueueOptions) {}

  /** Queue one sentence. Safe to call while earlier sentences are playing. */
  enqueue(text: string): void {
    const clean = text.trim();
    if (!clean) return;
    this.pending.push(clean);
    this.update();
    void this.pump();
  }

  /** Stop everything now: queued text, in-flight synthesis, playing audio. */
  stop(): void {
    this.epoch += 1;
    this.pending.length = 0;
    for (const clip of this.clips) {
      try {
        clip.stop();
      } catch {
        // A clip that already ended cannot be stopped; it is gone either way.
      }
    }
    this.clips.clear();
    this.envelopes.clear();
    this.nextStart = 0;
    this.update();
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  /**
   * The measured loudness of the neural voice right now (0..1), or null when
   * nothing neural is playing — the phone's own voice reports no audio, and
   * the Core then falls back to its labelled synthetic rhythm.
   */
  levelNow(): number | null {
    if (this.envelopes.size === 0) return null;
    const t = this.options.player.now();
    for (const { at, env } of this.envelopes.values()) {
      const index = Math.floor((t - at) / ENVELOPE_FRAME_S);
      if (index >= 0 && index < env.length) return env[index]!;
    }
    // Between scheduled clips (the lead before the first one): quiet, not unknown.
    return 0;
  }

  private async pump(): Promise<void> {
    if (this.synthesising) return;
    const epoch = this.epoch;

    while (this.pending.length > 0 && epoch === this.epoch && this.clips.size < 2) {
      const text = this.pending.shift()!;
      this.synthesising = true;
      this.synthesisEpoch = epoch;
      this.update();

      let samples: Float32Array | undefined;
      try {
        samples = await this.options.synthesize(text);
      } catch {
        samples = undefined;
      }

      // The owner said stop while this sentence was being synthesised: the
      // audio that just arrived belongs to an answer that no longer exists.
      if (epoch !== this.epoch) {
        this.synthesising = false;
        this.update();
        void this.pump();
        return;
      }
      this.synthesising = false;

      if (samples && samples.length > 0) {
        this.play(samples);
      } else {
        await this.speakFallback(text, epoch);
        if (epoch !== this.epoch) return;
      }
    }

    this.synthesising = false;
    this.update();
  }

  private play(samples: Float32Array): void {
    const { player } = this.options;
    const lead = this.options.leadSeconds ?? 0.05;
    const at = Math.max(player.now() + lead, this.nextStart);
    const clip = player.schedule(samples, at);
    this.nextStart = at + clip.duration;
    this.clips.add(clip);
    this.envelopes.set(clip, { at, env: speechEnvelope(samples) });
    this.update();

    clip.onEnded(() => {
      this.clips.delete(clip);
      this.envelopes.delete(clip);
      this.update();
      void this.pump();
    });
  }

  private async speakFallback(text: string, epoch: number): Promise<void> {
    // Let anything already scheduled finish first, so the fallback voice does
    // not talk over the neural one.
    this.fallbackActive += 1;
    this.update();
    try {
      await this.waitForClips(epoch);
      if (epoch !== this.epoch) return;
      await this.options.fallback(text);
    } catch {
      // The fallback failing too is not a reason to stop the rest of the answer.
    } finally {
      this.fallbackActive -= 1;
      this.update();
    }
  }

  private waitForClips(epoch: number): Promise<void> {
    if (this.clips.size === 0) return Promise.resolve();
    return new Promise((resolve) => {
      const check = () => {
        if (this.clips.size === 0 || epoch !== this.epoch) resolve();
        else setTimeout(check, 25);
      };
      check();
    });
  }

  private update(): void {
    const playing = this.clips.size > 0 || this.fallbackActive > 0;
    if (playing !== this.playing) {
      this.playing = playing;
      this.options.onPlaybackChange?.(playing);
    }
    const speaking = this.pending.length > 0 || (this.synthesising && this.synthesisEpoch === this.epoch) || this.clips.size > 0 || this.fallbackActive > 0;
    if (speaking === this.speaking) return;
    this.speaking = speaking;
    this.options.onSpeakingChange?.(speaking);
  }
}
