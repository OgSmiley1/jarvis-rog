import { describe, expect, it } from 'vitest';
import { brainOrder } from '@/lib/inference/brainOrder';
import { buildMessages, SPOKEN_STYLE } from '@/lib/inference/promptBuilder';

describe('which brain answers — offline-first, free cloud optional', () => {
  it('the phone answers by default: nothing leaves it', () => {
    expect(brainOrder({ localReady: true, cloudEnabled: false, cloudKeys: 2 })).toEqual(['local']);
  });
  it('with the free cloud on, cloud first and the phone as the fallback in the same turn', () => {
    expect(brainOrder({ localReady: true, cloudEnabled: true, cloudKeys: 1 })).toEqual(['cloud', 'local']);
  });
  it('cloud on but no usable key: the phone', () => {
    expect(brainOrder({ localReady: true, cloudEnabled: true, cloudKeys: 0 })).toEqual(['local']);
  });
  it('airplane mode with the brain loaded still has an answer path', () => {
    // A cloud attempt fails offline; the local brain is still in the order.
    expect(brainOrder({ localReady: true, cloudEnabled: true, cloudKeys: 3 })).toContain('local');
  });
  it('no brain at all is reported, not guessed', () => {
    expect(brainOrder({ localReady: false, cloudEnabled: false, cloudKeys: 0 })).toEqual([]);
  });
});

describe('spoken answers are written to be heard', () => {
  it('voice turns get the short spoken style, typed turns do not', () => {
    const spoken = buildMessages({ mode: 'fast', userMessage: 'hi', spoken: true })[0]!.content;
    const typed = buildMessages({ mode: 'fast', userMessage: 'hi' })[0]!.content;
    expect(spoken).toContain(SPOKEN_STYLE);
    expect(typed).not.toContain('SPOKEN REPLY');
  });
});

import { orbMood } from '@/lib/voice/orbState';

describe('the orb shows what is really happening', () => {
  const base = { speaking: false, busy: false, manualListening: false, modelStatus: 'ready' as const };
  it('speaking is shown while JARVIS talks — the state the old screen never had', () => {
    expect(orbMood({ ...base, speaking: true, busy: true })).toBe('SPEAKING');
  });
  it('thinking, then listening (including the follow-up window), then the brain state', () => {
    expect(orbMood({ ...base, busy: true })).toBe('THINKING');
    expect(orbMood({ ...base, loopPhase: 'FOLLOW_UP' })).toBe('LISTENING');
    expect(orbMood({ ...base, loopPhase: 'IDLE' })).toBe('READY');
    expect(orbMood({ ...base, modelStatus: 'unloaded' })).toBe('OFFLINE');
  });
});
