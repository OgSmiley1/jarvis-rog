import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeTool } from '@/lib/tools/router';

it('rejects unknown tools', async () => {
  const result = await executeTool({ id: '1', tool: 'danger.execute_anything', arguments: {} });
  expect(result.ok).toBe(false);
  expect(result.error).toBe('UNKNOWN_TOOL');
});


import { z } from 'zod';
import { toolRegistry } from '@/lib/tools/registry';
import { VoiceSessionController } from '@/lib/voice/voiceSession';

const call = { id: 'bounded', tool: 'test.bounded', arguments: {} };
afterEach(() => toolRegistry.delete(call.tool));

function fixture(execute = vi.fn(async () => ({ done: true }))) {
  toolRegistry.set(call.tool, { name: call.tool, target: 'ANDROID', confirmation: 'none', description: 'Test', schema: z.object({}), execute });
  return execute;
}

it('rejects cancelled/expired tools before executing side effects', async () => {
  const execute = fixture();
  const abort = new AbortController();
  abort.abort();
  expect(await executeTool(call, { turn: { signal: abort.signal } })).toMatchObject({ ok: false, error: 'TURN_CANCELLED' });
  expect(await executeTool(call, { turn: { deadlineAt: Date.now() - 1 } })).toMatchObject({ ok: false, error: 'TURN_DEADLINE' });
  expect(execute).not.toHaveBeenCalled();
});

it('enforces the three-operation budget in the real router', async () => {
  const execute = fixture();
  const session = new VoiceSessionController();
  const turn = session.beginTurn();
  const options = { turn: { signal: turn.signal, reserveTool: () => session.reserveTool(turn.turnId) } };
  for (let i = 0; i < 3; i += 1) expect((await executeTool(call, options)).ok).toBe(true);
  expect(await executeTool(call, options)).toMatchObject({ ok: false, error: 'TOOL_BUDGET_EXCEEDED' });
  expect(execute).toHaveBeenCalledTimes(3);
  session.cancel();
});

it('does not return an obsolete tool result as success', async () => {
  const abort = new AbortController();
  fixture(vi.fn(async () => { abort.abort(); return { done: true }; }));
  expect(await executeTool(call, { turn: { signal: abort.signal } })).toMatchObject({ ok: false, error: 'TURN_CANCELLED' });
});
