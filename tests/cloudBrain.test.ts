import { describe, expect, it } from 'vitest';
import {
  CLOUD_PROVIDERS,
  CloudBrainUnavailableError,
  askCloud,
  buildChatBody,
  describeHttpFailure,
  extractText,
  usableProviders,
  type FetchLike,
} from '@/lib/online/cloudBrain';

const MESSAGES = [
  { role: 'system' as const, content: 'You are JARVIS.' },
  { role: 'user' as const, content: 'What time is it?' },
];

const reply = (text: string) => JSON.stringify({ choices: [{ message: { content: text } }] });

/** A scripted fake network: each provider host answers as instructed. */
function fakeFetch(script: Record<string, { status?: number; body?: string; hang?: boolean; throws?: string }>) {
  const calls: { url: string; auth: string; body: Record<string, unknown> }[] = [];
  const impl: FetchLike = async (url, init) => {
    calls.push({ url, auth: init.headers.Authorization ?? '', body: JSON.parse(init.body) });
    const host = new URL(url).host;
    const step = script[host];
    if (!step) throw new Error(`unexpected host ${host}`);
    if (step.throws) throw new Error(step.throws);
    if (step.hang) return new Promise(() => undefined);
    const status = step.status ?? 200;
    return { ok: status >= 200 && status < 300, status, text: async () => step.body ?? '' };
  };
  return { impl, calls };
}

const CEREBRAS = 'api.cerebras.ai';
const GROQ = 'api.groq.com';
const GEMINI = 'generativelanguage.googleapis.com';

describe('cloud brain failover', () => {
  it('answers from the first provider that works', async () => {
    const net = fakeFetch({ [CEREBRAS]: { body: reply('It is nine.') } });
    const answer = await askCloud({ messages: MESSAGES, mode: 'fast', keys: { cerebras: 'k1', groq: 'k2' }, fetchImpl: net.impl });

    expect(answer.text).toBe('It is nine.');
    expect(answer.provider).toBe('cerebras');
    expect(net.calls).toHaveLength(1);
  });

  it('fails over Cerebras → Groq → Gemini in that order', async () => {
    const net = fakeFetch({
      [CEREBRAS]: { status: 429 },
      [GROQ]: { status: 503 },
      [GEMINI]: { body: reply('Gemini here.') },
    });
    const answer = await askCloud({
      messages: MESSAGES,
      mode: 'fast',
      keys: { cerebras: 'a', groq: 'b', gemini: 'c' },
      fetchImpl: net.impl,
    });

    expect(net.calls.map((call) => new URL(call.url).host)).toEqual([CEREBRAS, GROQ, GEMINI]);
    expect(answer.provider).toBe('gemini');
    expect(answer.attempts.map((attempt) => [attempt.provider, attempt.ok, attempt.error])).toEqual([
      ['cerebras', false, 'rate limited'],
      ['groq', false, 'provider error 503'],
      ['gemini', true, undefined],
    ]);
  });

  it('skips a provider the owner has no key for, rather than sending an empty key', async () => {
    const net = fakeFetch({ [GROQ]: { body: reply('Groq answered.') } });
    await askCloud({ messages: MESSAGES, mode: 'fast', keys: { groq: 'only-groq', cerebras: '   ' }, fetchImpl: net.impl });

    expect(net.calls).toHaveLength(1);
    expect(net.calls[0]!.auth).toBe('Bearer only-groq');
  });

  it('moves on from a provider that hangs, instead of hanging the assistant', async () => {
    const net = fakeFetch({ [CEREBRAS]: { hang: true }, [GROQ]: { body: reply('Fast fallback.') } });
    const answer = await askCloud({
      messages: MESSAGES,
      mode: 'fast',
      keys: { cerebras: 'a', groq: 'b' },
      fetchImpl: net.impl,
      timeoutMs: 20,
    });

    expect(answer.provider).toBe('groq');
    expect(answer.attempts[0]).toMatchObject({ provider: 'cerebras', ok: false, error: 'timed out' });
  });

  it('treats an empty reply as a failure, so it never speaks silence', async () => {
    const net = fakeFetch({ [CEREBRAS]: { body: reply('   ') }, [GROQ]: { body: reply('Real answer.') } });
    const answer = await askCloud({ messages: MESSAGES, mode: 'fast', keys: { cerebras: 'a', groq: 'b' }, fetchImpl: net.impl });
    expect(answer.text).toBe('Real answer.');
  });

  it('survives a network error on one provider', async () => {
    const net = fakeFetch({ [CEREBRAS]: { throws: 'Network request failed' }, [GROQ]: { body: reply('OK.') } });
    const answer = await askCloud({ messages: MESSAGES, mode: 'fast', keys: { cerebras: 'a', groq: 'b' }, fetchImpl: net.impl });
    expect(answer.attempts[0]!.error).toBe('Network request failed');
  });

  it('names every provider and its reason when all of them fail', async () => {
    const net = fakeFetch({ [CEREBRAS]: { status: 401 }, [GROQ]: { status: 404 } });
    const failure = await askCloud({ messages: MESSAGES, mode: 'fast', keys: { cerebras: 'a', groq: 'b' }, fetchImpl: net.impl }).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(CloudBrainUnavailableError);
    expect((failure as Error).message).toContain('cerebras (key rejected)');
    expect((failure as Error).message).toContain('groq (model not found');
  });

  it('refuses to call anything when no key is configured', async () => {
    const net = fakeFetch({});
    const failure = await askCloud({ messages: MESSAGES, mode: 'fast', keys: {}, fetchImpl: net.impl }).catch((error: unknown) => error);
    expect((failure as Error).message).toBe('CLOUD_NO_KEYS');
    expect(net.calls).toHaveLength(0);
  });

  it('uses the owner\'s model override, and the default otherwise', async () => {
    const net = fakeFetch({ [GROQ]: { body: reply('ok') } });
    await askCloud({
      messages: MESSAGES,
      mode: 'fast',
      keys: { groq: 'k' },
      models: { groq: 'llama-3.3-70b-versatile' },
      fetchImpl: net.impl,
    });
    expect(net.calls[0]!.body.model).toBe('llama-3.3-70b-versatile');

    const defaults = fakeFetch({ [GEMINI]: { body: reply('ok') } });
    await askCloud({ messages: MESSAGES, mode: 'fast', keys: { gemini: 'k' }, fetchImpl: defaults.impl });
    expect(defaults.calls[0]!.body.model).toBe(CLOUD_PROVIDERS.find((provider) => provider.id === 'gemini')!.defaultModel);
  });
});

describe('cloud brain request and response', () => {
  it('sends the same prompt the local brain would get, not streamed', () => {
    const body = buildChatBody('m', MESSAGES, 'fast');
    expect(body.messages).toBe(MESSAGES);
    expect(body.stream).toBe(false);
    expect(typeof body.max_tokens).toBe('number');
  });

  it('extracts the assistant text and rejects malformed or empty responses', () => {
    expect(extractText(reply('  hello  '))).toBe('hello');
    expect(() => extractText('<html>bad gateway</html>')).toThrow('malformed response');
    expect(() => extractText(JSON.stringify({ choices: [] }))).toThrow('empty reply');
  });

  it('explains HTTP failures in words the owner can act on', () => {
    expect(describeHttpFailure(401)).toBe('key rejected');
    expect(describeHttpFailure(429)).toBe('rate limited');
    expect(describeHttpFailure(404)).toMatch(/model not found/);
    expect(describeHttpFailure(502)).toBe('provider error 502');
  });

  it('keeps the provider order Cerebras, Groq, Gemini', () => {
    expect(CLOUD_PROVIDERS.map((provider) => provider.id)).toEqual(['cerebras', 'groq', 'gemini']);
    expect(usableProviders({ gemini: 'x', cerebras: 'y' }).map((provider) => provider.id)).toEqual(['cerebras', 'gemini']);
  });
});
