import { describe, expect, it } from 'vitest';
import { neuralSpeaker, type NeuralBackend } from '@/lib/voice/neuralSpeaker';
import { SpeechQueue, type Speaker } from '@/lib/voice/speechQueue';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function fakeBackend(failOn?: string) {
  const log: string[] = [];
  const synthStarted: string[] = [];
  const pending: Array<() => void> = [];
  const backend: NeuralBackend = {
    synthesize: async (text) => {
      synthStarted.push(text);
      if (text === failOn) throw new Error('cannot synthesise');
      return new Float32Array([text.length]);
    },
    play: (samples, onPlaying) =>
      new Promise<void>((resolve) => {
        log.push(`play:${samples[0]}`);
        onPlaying(() => {
          log.push('stopped');
          resolve();
        });
        pending.push(resolve);
      }),
  };
  return { backend, log, synthStarted, finish: () => pending.shift()?.() };
}

const systemVoice = (): Speaker & { said: string[] } => {
  const said: string[] = [];
  return {
    said,
    speak: (text, cb) => {
      said.push(text);
      cb.onStart?.();
      cb.onDone?.();
    },
    stop: () => undefined,
  };
};

describe('neural voice speaker', () => {
  it('synthesises the next sentence while the current one plays, and never overlaps', async () => {
    const fake = fakeBackend();
    const queue = new SpeechQueue(neuralSpeaker(fake.backend, systemVoice()));
    queue.enqueue('One.');
    queue.enqueue('Three.');
    await tick();
    expect(fake.synthStarted).toEqual(['One.', 'Three.']);
    expect(fake.log).toEqual(['play:4']);
    fake.finish();
    await tick();
    await tick();
    expect(fake.log).toEqual(['play:4', 'play:6']);
  });

  it('a sentence it cannot synthesise is spoken by the phone voice', async () => {
    const fake = fakeBackend('Odd.');
    const fallback = systemVoice();
    const queue = new SpeechQueue(neuralSpeaker(fake.backend, fallback));
    queue.enqueue('Odd.');
    await tick();
    await tick();
    expect(fallback.said).toEqual(['Odd.']);
  });

  it('stop silences now and nothing queued plays later', async () => {
    const fake = fakeBackend();
    const queue = new SpeechQueue(neuralSpeaker(fake.backend, systemVoice()));
    queue.enqueue('One.');
    queue.enqueue('Three.');
    await tick();
    queue.interrupt();
    await tick();
    await tick();
    expect(fake.log).toEqual(['play:4', 'stopped']);
  });
});
