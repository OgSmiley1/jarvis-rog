import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLocalOnly, installNetworkGuard } from '@/lib/net/localOnly';
import { requestJson } from '@/lib/net/http';
import { askCloud } from '@/lib/online/cloudBrain';
import { executeTool } from '@/lib/tools/router';
import { toolRegistry } from '@/lib/tools/registry';
import { z } from 'zod';
import { runSelfTest } from '@/lib/diagnostics/selfTest';
import { setTermuxSecret } from '@/lib/tools/termuxClient';
const originalFetch = globalThis.fetch;
afterEach(() => { setLocalOnly(false); globalThis.fetch = originalFetch; toolRegistry.delete('test.hanging'); vi.useRealTimers(); });

describe('hard Local Only', () => {
  it('blocks every registered network tool before its handler can execute', async () => {
    setLocalOnly(true);
    for (const tool of toolRegistry.values()) {
      if (!tool.network) continue;
      // Real schemas remain in place; invalid arguments must also refuse execution.
      const run = vi.spyOn(tool, 'execute');
      const result = await executeTool({ id: tool.name, tool: tool.name, arguments: {} }, { confirmed: true });
      expect(result.ok).toBe(false);
      expect(run).not.toHaveBeenCalled();
      run.mockRestore();
    }
    const result = await executeTool({ id: 'weather', tool: 'live.weather', arguments: { city: 'Dubai', day: 'tomorrow', lang: 'en' } });
    expect(result.error).toBe('LOCAL_ONLY_BLOCKED');
  });
  it('permits useful local tools without a model or Internet', async () => {
    setLocalOnly(true);
    const result = await executeTool({ id: 'math', tool: 'utility.calculate', arguments: { expression: '6*7', lang: 'en' } });
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result.data)).toContain('42');
    expect((await executeTool({ id: 'clock', tool: 'utility.time', arguments: { what: 'time', lang: 'en' } })).ok).toBe(true);
  });
  it('blocks live adapters and cloud AI even with injected transports and valid free keys', async () => {
    setLocalOnly(true);
    const fetchImpl = vi.fn();
    expect(await requestJson('https://api.open-meteo.com/v1/forecast', { provider: 'open-meteo', policy: { strict: true }, fetchImpl })).toMatchObject({ ok: false, code: 'blocked' });
    await expect(askCloud({ messages: [{ role: 'user', content: 'hello' }], mode: 'fast', keys: { groq: 'test' }, fetchImpl })).rejects.toThrow('LOCAL_ONLY_BLOCKED');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('blocks raw fetch and aborts an already running request on policy change', async () => {
    let signal: AbortSignal | undefined;
    const transport = vi.fn((_url: unknown, init?: RequestInit) => new Promise<Response>((_, reject) => {
      signal = init?.signal ?? undefined;
      signal?.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    globalThis.fetch = transport;
    installNetworkGuard();
    const pending = fetch('https://example.com');
    const outcome = expect(pending).rejects.toThrow('aborted');
    setLocalOnly(true);
    await outcome;
    expect(signal?.aborted).toBe(true);
    await expect(fetch('https://example.com')).rejects.toThrow('LOCAL_ONLY_BLOCKED');
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('allows the authenticated local Termux handler in Local Only while blocking lookalike hosts', async () => {
    const transport = vi.fn(async () => new Response(JSON.stringify({ ok: true, result: { uptimeSeconds: 1 } }), { status: 200 }));
    globalThis.fetch = transport;
    installNetworkGuard();
    await setTermuxSecret('local-test-secret');
    setLocalOnly(true);

    expect(toolRegistry.get('termux.system_status')).toMatchObject({ network: false, localOnlyCompatible: true });
    const result = await executeTool({ id: 'termux-local', tool: 'termux.system_status', arguments: {} });
    expect(result).toMatchObject({ ok: true, data: { uptimeSeconds: 1 } });
    expect(transport).toHaveBeenCalledWith('http://127.0.0.1:8765', expect.objectContaining({ method: 'POST' }));

    await expect(fetch('http://127.0.0.1:8765.evil.example')).rejects.toThrow('LOCAL_ONLY_BLOCKED');
    await expect(fetch('http://127.0.0.1:8766')).rejects.toThrow('LOCAL_ONLY_BLOCKED');
    await expect(fetch('https://example.com')).rejects.toThrow('LOCAL_ONLY_BLOCKED');
    expect(transport).toHaveBeenCalledTimes(1);
  });
});

it('returns from an uncooperative tool on cancellation and timeout', async () => {
  vi.useFakeTimers();
  toolRegistry.set('test.hanging', { name: 'test.hanging', description: 'test', target: 'ANDROID', confirmation: 'none', schema: z.object({}), execute: () => new Promise(() => undefined), network: false, permissions: [], localOnlyCompatible: true, timeoutMs: 100, cancellation: 'discard-result', availability: 'local' });
  const call = { id: '1', tool: 'test.hanging', arguments: {} };
  const abort = new AbortController();
  const first = executeTool(call, { turn: { signal: abort.signal } });
  abort.abort();
  expect(await first).toMatchObject({ ok: false, error: 'TURN_CANCELLED' });
  const second = executeTool(call);
  await vi.advanceTimersByTimeAsync(100);
  expect(await second).toMatchObject({ ok: false, error: 'TOOL_TIMEOUT' });
});

it('does not label missing models, visual animation or human voice checks PASS', async () => {
  const results = await runSelfTest({ modelPresent: false, modelReady: false, rendererMounted: true, sttReady: false, microphoneGranted: false, ttsVoices: 0 });
  expect(results.find(r => r.name === 'Local calculator')?.status).toBe('PASS');
  expect(results.find(r => r.name === 'Model file')?.status).toBe('BLOCKED');
  expect(results.find(r => r.name === 'Core renderer')?.status).toBe('UNVERIFIED');
  expect(results.find(r => r.name === 'Phone actions / speech / restart')?.status).toBe('UNVERIFIED');
  expect(results.find(r => r.name === 'Local inference')?.status).toBe('BLOCKED');
});
it('reports failed local inference honestly', async () => {
  const results = await runSelfTest({ modelPresent: true, modelReady: true, infer: async () => { throw new Error('Native model error'); } });
  expect(results.find(r => r.name === 'Local inference')).toMatchObject({ status: 'FAIL', detail: 'Native model error' });
});
it('keeps capture/transcription unverified until actual frames/text are observed', async () => {
  const missing = await runSelfTest({ modelPresent: false, modelReady: false, microphoneGranted: true });
  expect(missing.find(r => r.name === 'Microphone permission')?.status).toBe('PASS');
  expect(missing.find(r => r.name === 'Microphone capture')?.status).toBe('UNVERIFIED');
  expect(missing.find(r => r.name === 'Speech transcription')?.status).toBe('UNVERIFIED');
  const observed = await runSelfTest({ modelPresent: true, modelReady: true, microphoneCaptureAt: 1000, transcriptAt: 2000, infer: async () => ({ text: 'READY', firstTokenMs: 123, totalMs: 456 }) });
  expect(observed.find(r => r.name === 'Local inference')).toMatchObject({ status: 'PASS', detail: expect.stringContaining('123 ms') });
  expect(observed.find(r => r.name === 'Microphone capture')?.detail).toContain('quality is not assessed');
});
