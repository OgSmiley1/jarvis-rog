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
  /**
   * A tiny lead so the first clip is never scheduled in the audio clock's
   * past (which would clip its first syllable).
   */
  leadSeconds?: number;
}

export class NeuralSpeechQueue {
  private readonly pending: string[] = [];
  private readonly clips = new Set<ScheduledClip>();
  private nextStart = 0;
  private synthesising = false;
  private fallbackActive = 0;
  private epoch = 0;
  private speaking = false;

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
    this.nextStart = 0;
    this.synthesising = false;
    this.update();
  }

  get isSpeaking(): boolean {
    return this.speaking;
  }

  private async pump(): Promise<void> {
    if (this.synthesising) return;
    const epoch = this.epoch;

    while (this.pending.length > 0 && epoch === this.epoch) {
      const text = this.pending.shift()!;
      this.synthesising = true;
      this.update();

      let samples: Float32Array | undefined;
      try {
        samples = await this.options.synthesize(text);
      } catch {
        samples = undefined;
      }

      // The owner said stop while this sentence was being synthesised: the
      // audio that just arrived belongs to an answer that no longer exists.
      if (epoch !== this.epoch) return;
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
    this.update();

    clip.onEnded(() => {
      this.clips.delete(clip);
      this.update();
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
    const speaking = this.pending.length > 0 || this.synthesising || this.clips.size > 0 || this.fallbackActive > 0;
    if (speaking === this.speaking) return;
    this.speaking = speaking;
    this.options.onSpeakingChange?.(speaking);
  }
}
