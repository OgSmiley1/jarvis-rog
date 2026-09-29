import { describe, expect, it } from 'vitest';
import { stages, summarize } from '@/lib/voice/latency';

describe('voice latency stages', () => {
  it('splits a turn into what the owner feels', () => {
    expect(stages({ heardAt: 0, askedAt: 100, firstTokenAt: 2100, firstAudioAt: 3100, endedAt: 8000 })).toEqual({
      heardToAskMs: 100,
      firstTokenMs: 2000,
      firstAudioMs: 3000,
      userWaitMs: 3100,
      totalMs: 7900,
    });
  });
  it('typed turns measure the wait from send', () => {
    expect(stages({ askedAt: 50, firstAudioAt: 850 }).userWaitMs).toBe(800);
  });
  it('fails the 5 s target on a 37 s answer, like the old build', () => {
    expect(summarize([{ askedAt: 0, firstAudioAt: 37_070 }]).pass).toBe(false);
    expect(summarize([{ askedAt: 0, firstAudioAt: 3_000 }]).pass).toBe(true);
    expect(summarize([]).pass).toBe(false);
  });
});
