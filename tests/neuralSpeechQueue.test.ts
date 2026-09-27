import { describe, expect, it } from 'vitest';
import { NeuralSpeechQueue, type NeuralPlayer, type ScheduledClip } from '@/lib/voice/neuralSpeechQueue';

const SAMPLE_RATE = 24_000;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A fake audio clock: clips never end on their own; the test ends them. */
function fakePlayer() {
  let clock = 0;
  const scheduled: { at: number; duration: number; stopped: boolean; end: () => void }[] = [];
  const player: NeuralPlayer = {
    now: () => clock,
    schedule(samples, at) {
      let ended: (() => void) | undefined;
      const entry = {
        at,
        duration: samples.length / SAMPLE_RATE,
        stopped: false,
        end: () => ended?.(),
      };
      scheduled.push(entry);
      const clip: ScheduledClip = {
        duration: entry.duration,
        onEnded: (callback) => {
          ended = callback;
        },
        stop: () => {
          entry.stopped = true;
          ended?.();
        },
      };
      return clip;
    },
  };
  return { player, scheduled, advance: (seconds: number) => (clock += seconds) };
}

/** A synthesiser whose results the test releases one at a time. */
function controlledSynth() {
  const calls: string[] = [];
  const waiting: { text: string; resolve: (samples: Float32Array) => void; reject: (error: Error) => void }[] = [];
  let concurrent = 0;
  let maxConcurrent = 0;
  const synthesize = (text: string) =>
    new Promise<Float32Array>((resolve, reject) => {
      calls.push(text);
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      waiting.push({
        text,
        resolve: (samples) => {
          concurrent -= 1;
          resolve(samples);
        },
        reject: (error) => {
          concurrent -= 1;
          reject(error);
        },
      });
    });
  const seconds = (s: number) => new Float32Array(Math.round(s * SAMPLE_RATE));
  return {
    synthesize,
    calls,
    maxConcurrent: () => maxConcurrent,
    release: async (s = 1) => {
      waiting.shift()!.resolve(seconds(s));
      await flush();
      await flush();
    },
    fail: async () => {
      waiting.shift()!.reject(new Error('synthesis failed'));
      await flush();
      await flush();
    },
  };
}

describe('neural speech queue', () => {
  it('never runs two syntheses at once, because Kokoro refuses that', async () => {
    const synth = controlledSynth();
    const { player } = fakePlayer();
    const queue = new NeuralSpeechQueue({ synthesize: synth.synthesize, player, fallback: async () => undefined });

    queue.enqueue('One.');
    queue.enqueue('Two.');
    queue.enqueue('Three.');
    await flush();
    expect(synth.calls).toEqual(['One.']);

    await synth.release();
    await synth.release();
    await synth.release();
    expect(synth.calls).toEqual(['One.', 'Two.', 'Three.']);
    expect(synth.maxConcurrent()).toBe(1);
  });

  it('plays sentences back to back on the audio clock, with no gap and no overlap', async () => {
    const synth = controlledSynth();
    const audio = fakePlayer();
    const queue = new NeuralSpeechQueue({
      synthesize: synth.synthesize,
      player: audio.player,
      fallback: async () => undefined,
      leadSeconds: 0.05,
    });

    queue.enqueue('First sentence.');
    queue.enqueue('Second sentence.');
    await synth.release(2);
    await synth.release(1.5);

    expect(audio.scheduled).toHaveLength(2);
    expect(audio.scheduled[0]!.at).toBeCloseTo(0.05, 5);
    expect(audio.scheduled[1]!.at).toBeCloseTo(0.05 + 2, 5);
  });

  it('synthesises the next sentence while the current one is still playing', async () => {
    const synth = controlledSynth();
    const audio = fakePlayer();
    const queue = new NeuralSpeechQueue({ synthesize: synth.synthesize, player: audio.player, fallback: async () => undefined });

    queue.enqueue('First.');
    queue.enqueue('Second.');
    await synth.release(3);

    // The first clip has not ended, and the second is already being made.
    expect(audio.scheduled).toHaveLength(1);
    expect(synth.calls).toEqual(['First.', 'Second.']);
  });

  it('speaks a sentence with the fallback voice when the neural voice fails on it', async () => {
    const synth = controlledSynth();
    const audio = fakePlayer();
    const fellBack: string[] = [];
    const queue = new NeuralSpeechQueue({
      synthesize: synth.synthesize,
      player: audio.player,
      fallback: async (text) => {
        fellBack.push(text);
      },
    });

    queue.enqueue('This one fails.');
    queue.enqueue('This one works.');
    await synth.fail();
    await synth.release();

    expect(fellBack).toEqual(['This one fails.']);
    expect(audio.scheduled).toHaveLength(1);
  });

  it('does not let the fallback voice talk over neural audio still playing', async () => {
    const synth = controlledSynth();
    const audio = fakePlayer();
    const fellBack: string[] = [];
    const queue = new NeuralSpeechQueue({
      synthesize: synth.synthesize,
      player: audio.player,
      fallback: async (text) => {
        fellBack.push(text);
      },
    });

    queue.enqueue('Neural first.');
    queue.enqueue('Fails second.');
    await synth.release(2);
    await synth.fail();
    expect(fellBack).toEqual([]);

    audio.scheduled[0]!.end();
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(fellBack).toEqual(['Fails second.']);
  });

  it('stops everything on barge-in, including audio already playing', async () => {
    const synth = controlledSynth();
    const audio = fakePlayer();
    const queue = new NeuralSpeechQueue({ synthesize: synth.synthesize, player: audio.player, fallback: async () => undefined });

    queue.enqueue('Playing.');
    queue.enqueue('Queued.');
    await synth.release();
    queue.stop();

    expect(audio.scheduled[0]!.stopped).toBe(true);
    expect(queue.isSpeaking).toBe(false);
  });

  it('discards a synthesis that lands after the owner said stop', async () => {
    const synth = controlledSynth();
    const audio = fakePlayer();
    const queue = new NeuralSpeechQueue({ synthesize: synth.synthesize, player: audio.player, fallback: async () => undefined });

    queue.enqueue('Being made when stop arrives.');
    await flush();
    queue.stop();
    await synth.release();

    expect(audio.scheduled).toHaveLength(0);
  });

  it('reports speaking from the first sentence until the last clip ends', async () => {
    const synth = controlledSynth();
    const audio = fakePlayer();
    const transitions: boolean[] = [];
    const queue = new NeuralSpeechQueue({
      synthesize: synth.synthesize,
      player: audio.player,
      fallback: async () => undefined,
      onSpeakingChange: (speaking) => transitions.push(speaking),
    });

    queue.enqueue('Only sentence.');
    expect(transitions).toEqual([true]);
    await synth.release();
    expect(queue.isSpeaking).toBe(true);

    audio.scheduled[0]!.end();
    expect(transitions).toEqual([true, false]);
  });

  it('ignores empty text instead of synthesising silence', async () => {
    const synth = controlledSynth();
    const { player } = fakePlayer();
    const queue = new NeuralSpeechQueue({ synthesize: synth.synthesize, player, fallback: async () => undefined });
    queue.enqueue('   ');
    await flush();
    expect(synth.calls).toEqual([]);
    expect(queue.isSpeaking).toBe(false);
  });
});
