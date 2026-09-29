/**
 * One ordered voice: sentences are spoken first-in, first-out, never over
 * each other, and never with a stop() between them.
 *
 * Up to `window` sentences (default 2) are handed to the engine ahead of
 * time, so the next one is already queued inside the engine when the current
 * one ends — no gap while JavaScript reacts to "done". `interrupt()` drops
 * everything at once: the waiting list, the engine's own queue, and any
 * callback still in flight from the killed turn (an epoch check), so a
 * sentence from an abandoned answer can never play later.
 *
 * The speaker is injected, so this is unit-tested without a phone.
 */

export interface SpeakCallbacks {
  onStart?: () => void;
  onDone?: () => void;
  onError?: (error: unknown) => void;
}

export interface Speaker {
  speak(text: string, callbacks: SpeakCallbacks): void;
  stop(): void;
}

export interface SpeechQueueEvents {
  /** True from the first sentence starting until the last one ends. */
  onSpeakingChange?: (speaking: boolean) => void;
  /** The first sound of this turn: the time-to-first-audio moment. */
  onFirstAudio?: () => void;
  /** Each sentence as it is handed to the voice (the loop uses it to recognise its own echo). */
  onSentence?: (text: string) => void;
}

export class SpeechQueue {
  private waiting: string[] = [];
  private inEngine = 0;
  private epoch = 0;
  private speaking = false;
  private heardFirst = false;

  constructor(
    private readonly speaker: Speaker,
    private readonly events: SpeechQueueEvents = {},
    private readonly window = 2,
  ) {}

  get isSpeaking(): boolean {
    return this.speaking;
  }

  /** Sentences waiting or playing. */
  get size(): number {
    return this.waiting.length + this.inEngine;
  }

  enqueue(sentence: string): void {
    const text = sentence.trim();
    if (!text) return;
    this.waiting.push(text);
    this.setSpeaking(true);
    this.pump();
  }

  /** Barge-in or a new turn: silence now, and nothing from before plays later. */
  interrupt(): void {
    this.epoch += 1;
    this.waiting = [];
    this.inEngine = 0;
    this.heardFirst = false;
    this.speaker.stop();
    this.setSpeaking(false);
  }

  /** A new turn that should not cut off the current one starts its own first-audio clock. */
  beginTurn(): void {
    this.heardFirst = false;
  }

  private pump(): void {
    while (this.inEngine < this.window && this.waiting.length > 0) {
      const text = this.waiting.shift()!;
      const epoch = this.epoch;
      this.inEngine += 1;
      this.events.onSentence?.(text);
      const finished = () => {
        if (epoch !== this.epoch) return;
        this.inEngine = Math.max(0, this.inEngine - 1);
        this.pump();
        if (this.inEngine === 0 && this.waiting.length === 0) this.setSpeaking(false);
      };
      this.speaker.speak(text, {
        onStart: () => {
          if (epoch !== this.epoch || this.heardFirst) return;
          this.heardFirst = true;
          this.events.onFirstAudio?.();
        },
        onDone: finished,
        onError: finished,
      });
    }
  }

  private setSpeaking(value: boolean): void {
    if (this.speaking === value) return;
    this.speaking = value;
    this.events.onSpeakingChange?.(value);
  }
}
