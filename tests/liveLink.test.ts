import { describe, expect, it } from 'vitest';
import { LiveLog, formatEvent, sanitize, scrubText } from '@/lib/telemetry/liveLog';
import {
  COMMENT_BUDGET,
  GithubLiveChannel,
  describeRefusal,
  fenceSafe,
  renderComment,
  takeBatch,
  type ChannelFetch,
  type ChannelResponse,
} from '@/lib/telemetry/githubChannel';

function response(status: number, body: unknown = {}, headers: Record<string, string> = {}): ChannelResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
  };
}

/** Manual clock and timers, so batching is tested without waiting. */
function harness(replies: Array<ChannelResponse | Error>) {
  let now = 1_000_000;
  const timers: Array<{ at: number; fn: () => void; id: number }> = [];
  let nextId = 0;
  const calls: Array<{ url: string; method: string; body?: string; auth?: string }> = [];
  const fetchImpl: ChannelFetch = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body, auth: init.headers.Authorization });
    const reply = replies.shift() ?? response(201, {});
    if (reply instanceof Error) throw reply;
    return reply;
  };
  const clock = {
    now: () => now,
    setTimer: (fn: () => void, ms: number) => {
      const id = (nextId += 1);
      timers.push({ at: now + ms, fn, id });
      return id;
    },
    clearTimer: (handle: unknown) => {
      const index = timers.findIndex((timer) => timer.id === handle);
      if (index >= 0) timers.splice(index, 1);
    },
  };
  async function advance(ms: number) {
    const target = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (!next || next.at > target) break;
      timers.shift();
      now = next.at;
      next.fn();
      // Let the flush's awaited fetch settle.
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
    }
    now = target;
  }
  return { calls, fetchImpl, clock, advance, pendingTimers: () => timers.length };
}

describe('live log', () => {
  it('scrubs credentials from text and from secret-named fields', () => {
    expect(scrubText('my key is gsk_abcdefghijklmnopqrstuvwxyz0123')).toBe('my key is [redacted]');
    expect(scrubText('github_pat_11ABCDEFG0123456789_abcdefghijklmnop')).toBe('[redacted]');
    expect(scrubText('AIzaSyA1234567890abcdefghijklmnopqrstu')).toBe('[redacted]');
    expect(sanitize({ apiKey: 'plain', token: 'x', ms: 12, ok: true, model: 'qwen' })).toEqual({
      apiKey: '[redacted]',
      token: '[redacted]',
      ms: 12,
      ok: true,
      model: 'qwen',
    });
  });

  it('bounds its memory and notifies subscribers', () => {
    const log = new LiveLog(() => 0, 3);
    const seen: string[] = [];
    log.subscribe((event) => seen.push(event.message));
    for (const word of ['a', 'b', 'c', 'd']) log.record('heard', word);
    expect(log.snapshot().map((event) => event.message)).toEqual(['b', 'c', 'd']);
    expect(seen).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps recording when a subscriber throws', () => {
    const log = new LiveLog(() => 0);
    log.subscribe(() => {
      throw new Error('sink broke');
    });
    expect(() => log.record('state', 'LISTENING')).not.toThrow();
    expect(log.snapshot()).toHaveLength(1);
  });

  it('formats one readable line per event', () => {
    const line = formatEvent({ seq: 1, at: new Date(2026, 8, 23, 22, 10, 3, 120).getTime(), kind: 'answer', message: 'It is ten past ten.', data: { source: 'local', ms: 840 } });
    expect(line).toBe('22:10:03.120 ANSWER It is ten past ten. · source=local ms=840');
  });
});

describe('GitHub live channel helpers', () => {
  it('cannot be broken out of its code block by spoken backticks', () => {
    expect(fenceSafe('say ```rm -rf``` now')).toBe("say '''rm -rf''' now");
    const body = renderComment('android 36', 'abc123', 2, ['one', '```']);
    expect(body.split('```').length).toBe(3);
  });

  it('splits long logs to fit GitHub comment size', () => {
    const line = 'x'.repeat(1000);
    const { batch, rest } = takeBatch(Array.from({ length: 100 }, () => line));
    expect(batch.join('\n').length).toBeLessThanOrEqual(COMMENT_BUDGET);
    expect(batch.length + rest.length).toBe(100);
    expect(takeBatch(['y'.repeat(COMMENT_BUDGET * 2)]).batch[0]!.length).toBe(COMMENT_BUDGET);
  });

  it('explains refusals in terms of what to fix', () => {
    expect(describeRefusal(401, { owner: 'o', repo: 'r' })).toMatch(/token/);
    expect(describeRefusal(404, { owner: 'o', repo: 'r', number: 1 })).toMatch(/Issues: Read and write/);
  });
});

describe('GitHub live channel', () => {
  const log = new LiveLog(() => 0);
  const event = (message: string) => log.record('heard', message);

  it('opens one issue per session when no number is configured, then batches events', async () => {
    const h = harness([response(201, { number: 7, html_url: 'https://github.com/o/r/issues/7' })]);
    const channel = new GithubLiveChannel({ target: { owner: 'o', repo: 'r' }, token: 't0k', header: 'android 36', fetchImpl: h.fetchImpl, ...h.clock });
    const status = await channel.start();
    expect(status.state).toBe('live');
    expect(status.number).toBe(7);
    expect(h.calls[0]).toMatchObject({ url: 'https://api.github.com/repos/o/r/issues', method: 'POST', auth: 'Bearer t0k' });

    channel.push(event('jarvis'));
    channel.push(event('what time is it'));
    await h.advance(1_500);
    expect(h.calls).toHaveLength(2);
    expect(h.calls[1]!.url).toBe('https://api.github.com/repos/o/r/issues/7/comments');
    const body = JSON.parse(h.calls[1]!.body!).body as string;
    expect(body).toContain('jarvis');
    expect(body).toContain('what time is it');
    expect(channel.status.posted).toBe(1);
  });

  it('never posts more often than the minimum interval', async () => {
    const h = harness([response(200, { number: 3 })]);
    const channel = new GithubLiveChannel({ target: { owner: 'o', repo: 'r', number: 3 }, token: 't', header: 'h', fetchImpl: h.fetchImpl, ...h.clock });
    await channel.start();
    expect(h.calls[0]).toMatchObject({ url: 'https://api.github.com/repos/o/r/issues/3', method: 'GET' });
    channel.push(event('one'));
    await h.advance(1_500);
    channel.push(event('two'));
    await h.advance(1_500);
    expect(h.calls).toHaveLength(2);
    await h.advance(8_000);
    expect(h.calls).toHaveLength(3);
  });

  it('stops on a rejected token instead of retrying forever', async () => {
    const h = harness([response(401)]);
    const channel = new GithubLiveChannel({ target: { owner: 'o', repo: 'r' }, token: 'bad', header: 'h', fetchImpl: h.fetchImpl, ...h.clock });
    const status = await channel.start();
    expect(status.state).toBe('error');
    expect(status.error).toMatch(/token/);
    channel.push(event('ignored'));
    await h.advance(60_000);
    expect(h.calls).toHaveLength(1);
  });

  it('backs off when GitHub asks, keeping the lines, then delivers them', async () => {
    const h = harness([response(200, { number: 1 }), response(403, {}, { 'retry-after': '30' })]);
    const channel = new GithubLiveChannel({ target: { owner: 'o', repo: 'r', number: 1 }, token: 't', header: 'h', fetchImpl: h.fetchImpl, ...h.clock });
    await channel.start();
    channel.push(event('keep me'));
    await h.advance(1_500);
    expect(channel.status.state).toBe('backoff');
    expect(channel.status.pending).toBe(1);
    await h.advance(20_000);
    expect(h.calls).toHaveLength(2);
    await h.advance(15_000);
    expect(h.calls).toHaveLength(3);
    expect(JSON.parse(h.calls[2]!.body!).body).toContain('keep me');
    expect(channel.status.state).toBe('live');
  });

  it('survives a dropped connection', async () => {
    const h = harness([response(200, { number: 1 }), new Error('offline')]);
    const channel = new GithubLiveChannel({ target: { owner: 'o', repo: 'r', number: 1 }, token: 't', header: 'h', fetchImpl: h.fetchImpl, ...h.clock });
    await channel.start();
    channel.push(event('after the tunnel'));
    await h.advance(1_500);
    expect(channel.status.state).toBe('backoff');
    await h.advance(16_000);
    expect(JSON.parse(h.calls[2]!.body!).body).toContain('after the tunnel');
  });

  it('ends itself at the session limit and posts what was left', async () => {
    const h = harness([response(200, { number: 1 })]);
    const channel = new GithubLiveChannel({
      target: { owner: 'o', repo: 'r', number: 1 },
      token: 't',
      header: 'h',
      fetchImpl: h.fetchImpl,
      maxDurationMs: 60_000,
      ...h.clock,
    });
    await channel.start();
    await h.advance(60_000);
    expect(channel.status.state).toBe('stopped');
    expect(JSON.parse(h.calls.at(-1)!.body!).body).toContain('30-minute session limit');
    channel.push(event('too late'));
    expect(h.pendingTimers()).toBe(0);
  });
});
