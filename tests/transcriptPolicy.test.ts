import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { liveLog, recordLive } from '@/lib/telemetry/liveLog';
import { liveLog as sharedLog } from '@/lib/telemetry/liveLog';
import { readChannelVisibility, type ChannelFetch } from '@/lib/telemetry/githubChannel';
import { getLiveVisibility, startLiveLink, stopLiveLink } from '@/lib/telemetry/liveSession';
import {
  carriesWords,
  liveText,
  privateChannelIsLive,
  setPrivateChannelLive,
  TRANSCRIPT_OPT_IN_MS,
  transcriptsAllowed,
} from '@/lib/telemetry/transcriptPolicy';

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

  it('the owner can opt in, for a limited time, to a private channel', () => {
    const until = now + TRANSCRIPT_OPT_IN_MS;
    setPrivateChannelLive(true);
    expect(transcriptsAllowed(until, now)).toBe(true);
    expect(liveText(dictated, until, now)).toBe(dictated);
    expect(transcriptsAllowed(until, now + TRANSCRIPT_OPT_IN_MS)).toBe(false);
  });

  it('counts are honest for empty and single words', () => {
    expect(liveText('   ', undefined, now)).toBe('[0 words]');
    expect(liveText('jarvis', undefined, now)).toBe('[1 word]');
  });
});

afterEach(() => setPrivateChannelLive(false));

const repoAnswer = (status: number, body: unknown): ChannelFetch => async () => ({ ok: status < 300, status, text: async () => JSON.stringify(body) });

describe('words never go to a public channel', () => {
  it('an opt-in alone is not enough: no confirmed-private link, no words', () => {
    expect(liveText(dictated, now + TRANSCRIPT_OPT_IN_MS, now)).toBe('[9 words]');
  });

  it('only a clear private:true counts as private', async () => {
    const target = { owner: 'o', repo: 'r' };
    await expect(readChannelVisibility(target, 't', repoAnswer(200, { private: true }))).resolves.toBe('private');
    await expect(readChannelVisibility(target, 't', repoAnswer(200, { private: false }))).resolves.toBe('public');
    await expect(readChannelVisibility(target, 't', repoAnswer(200, {}))).resolves.toBe('unknown');
    await expect(readChannelVisibility(target, 't', repoAnswer(404, {}))).resolves.toBe('unknown');
    await expect(readChannelVisibility(target, 't', async () => { throw new Error('offline'); })).resolves.toBe('unknown');
  });

  it('knows which log lines hold words', () => {
    expect(carriesWords({ kind: 'heard', message: 'call mom' })).toBe(true);
    expect(carriesWords({ kind: 'heard', message: '[2 words]' })).toBe(false);
    expect(carriesWords({ kind: 'answer', message: '[private phone data]' })).toBe(false);
    expect(carriesWords({ kind: 'speak', message: 'speaking' })).toBe(false);
    expect(carriesWords({ kind: 'wake', message: 'wake word + command', data: { command: 'open the camera' } })).toBe(true);
    expect(carriesWords({ kind: 'wake', message: 'wake word + command', data: { command: '[3 words]' } })).toBe(false);
    expect(carriesWords({ kind: 'state', message: 'LISTENING' })).toBe(false);
  });

  it('a link to a public repository keeps words off, and does not replay earlier words', async () => {
    sharedLog.clear();
    // Words recorded under an earlier private link…
    sharedLog.record('heard', dictated);
    const posted: string[] = [];
    const fetchImpl: ChannelFetch = async (url, init) => {
      if (init.body) posted.push(init.body);
      if (url === 'https://api.github.com/repos/o/pub') return { ok: true, status: 200, text: async () => JSON.stringify({ private: false }) };
      return { ok: true, status: 201, text: async () => JSON.stringify({ number: 1, html_url: 'https://github.com/o/pub/issues/1' }) };
    };
    vi.useFakeTimers();
    try {
      await startLiveLink({ target: { owner: 'o', repo: 'pub' }, token: 't', header: 'h', fetchImpl });
      expect(getLiveVisibility()).toBe('public');
      expect(privateChannelIsLive()).toBe(false);
      expect(liveText(dictated, now + TRANSCRIPT_OPT_IN_MS, now)).toBe('[9 words]');
      await vi.advanceTimersByTimeAsync(20_000);
      await stopLiveLink();
      await vi.advanceTimersByTimeAsync(20_000);
    } finally {
      vi.useRealTimers();
    }
    const everything = posted.join('\n');
    expect(everything).toContain('visibility=public');
    for (const secret of ['Ahmed', '0501234567', '4471']) expect(everything).not.toContain(secret);
  });

  it('a confirmed-private link allows words while the opt-in lasts, and stops allowing them when it ends', async () => {
    const fetchImpl: ChannelFetch = async (url) => {
      if (url === 'https://api.github.com/repos/o/priv') return { ok: true, status: 200, text: async () => JSON.stringify({ private: true }) };
      return { ok: true, status: 201, text: async () => JSON.stringify({ number: 2 }) };
    };
    await startLiveLink({ target: { owner: 'o', repo: 'priv' }, token: 't', header: 'h', fetchImpl });
    expect(privateChannelIsLive()).toBe(true);
    expect(liveText(dictated, now + TRANSCRIPT_OPT_IN_MS, now)).toBe(dictated);
    await stopLiveLink();
    expect(privateChannelIsLive()).toBe(false);
    expect(liveText(dictated, now + TRANSCRIPT_OPT_IN_MS, now)).toBe('[9 words]');
  });
});
