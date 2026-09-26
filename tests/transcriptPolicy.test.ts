import { beforeEach, describe, expect, it } from 'vitest';
import { liveLog, recordLive } from '@/lib/telemetry/liveLog';
import { liveText, TRANSCRIPT_OPT_IN_MS, transcriptsAllowed } from '@/lib/telemetry/transcriptPolicy';

const dictated = 'text Ahmed 0501234567 saying the door code is 4471';
const now = 1_790_000_000_000;

describe('live log carries word counts, not words, by default', () => {
  beforeEach(() => liveLog.clear());

  it('a dictated message never reaches the log or its export', () => {
    recordLive('heard', liveText(dictated, undefined, now));
    recordLive('ask', liveText(dictated, undefined, now), { route: 'tool' });
    const exported = liveLog.toText();
    for (const secret of ['Ahmed', '0501234567', '4471', 'door code']) {
      expect(exported).not.toContain(secret);
      expect(JSON.stringify(liveLog.snapshot())).not.toContain(secret);
    }
    expect(exported).toContain('[9 words]');
  });

  it('an expired opt-in is the same as none', () => {
    expect(liveText(dictated, now - 1, now)).toBe('[9 words]');
  });

  it('the owner can opt in, for a limited time', () => {
    const until = now + TRANSCRIPT_OPT_IN_MS;
    expect(transcriptsAllowed(until, now)).toBe(true);
    expect(liveText(dictated, until, now)).toBe(dictated);
    expect(transcriptsAllowed(until, now + TRANSCRIPT_OPT_IN_MS)).toBe(false);
  });

  it('counts are honest for empty and single words', () => {
    expect(liveText('   ', undefined, now)).toBe('[0 words]');
    expect(liveText('jarvis', undefined, now)).toBe('[1 word]');
  });
});
