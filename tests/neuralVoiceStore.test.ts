import { beforeEach, describe, expect, it } from 'vitest';
import {
  getNeuralVoiceStatus,
  previewNeuralVoice,
  registerNeuralPreviewer,
  resetNeuralVoiceStoreForTests,
  setNeuralVoiceStatus,
  subscribeNeuralVoice,
} from '@/lib/voice/neuralVoiceStore';

describe('neural voice status store', () => {
  beforeEach(() => resetNeuralVoiceStoreForTests());

  it('starts disabled and not ready', () => {
    expect(getNeuralVoiceStatus()).toEqual({ enabled: false, ready: false, progress: 0 });
  });

  it('notifies subscribers on a real change only', () => {
    let calls = 0;
    subscribeNeuralVoice(() => (calls += 1));
    setNeuralVoiceStatus({ enabled: true, ready: false, progress: 0.4 });
    setNeuralVoiceStatus({ enabled: true, ready: false, progress: 0.4 });
    expect(calls).toBe(1);
  });

  it('keeps the same object when nothing changed, as useSyncExternalStore requires', () => {
    setNeuralVoiceStatus({ enabled: true, ready: true, progress: 1 });
    const first = getNeuralVoiceStatus();
    setNeuralVoiceStatus({ enabled: true, ready: true, progress: 1 });
    expect(getNeuralVoiceStatus()).toBe(first);
  });

  it('refuses to preview before the voice is loaded, instead of pretending', async () => {
    let spoken = '';
    registerNeuralPreviewer(async (text) => {
      spoken = text;
    });
    expect(await previewNeuralVoice('hello')).toBe(false);
    expect(spoken).toBe('');

    setNeuralVoiceStatus({ enabled: true, ready: true, progress: 1 });
    expect(await previewNeuralVoice('hello')).toBe(true);
    expect(spoken).toBe('hello');
  });

  it('stops notifying after unsubscribe', () => {
    let calls = 0;
    const unsubscribe = subscribeNeuralVoice(() => (calls += 1));
    unsubscribe();
    setNeuralVoiceStatus({ enabled: true, ready: false, progress: 0.1 });
    expect(calls).toBe(0);
  });
});
