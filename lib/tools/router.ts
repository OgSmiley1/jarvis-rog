import { isLocalOnly, subscribeNetworkPolicy } from '@/lib/net/localOnly';
import { toolRegistry } from './registry';
import type { JarvisToolCall, ToolResult, ToolRunContext } from './types';

export interface ExecuteToolOptions {
  confirmed?: boolean;
  /** Cancellation and deadline of the voice turn that asked for this. */
  turn?: ToolRunContext;
}

export async function executeTool(
  call: JarvisToolCall,
  options: ExecuteToolOptions = {},
): Promise<ToolResult> {
  const startedAt = Date.now();
  const definition = toolRegistry.get(call.tool);

  if (!definition) {
    return { callId: call.id, tool: call.tool, ok: false, startedAt, finishedAt: Date.now(), error: 'UNKNOWN_TOOL' };
  }

  if (definition.confirmation === 'required' && !options.confirmed) {
    return { callId: call.id, tool: call.tool, ok: false, startedAt, finishedAt: Date.now(), error: 'CONFIRMATION_REQUIRED' };
  }

  const parsed = definition.schema.safeParse(call.arguments);
  if (!parsed.success) {
    return {
      callId: call.id,
      tool: call.tool,
      ok: false,
      startedAt,
      finishedAt: Date.now(),
      error: `INVALID_ARGUMENTS: ${parsed.error.message}`,
    };
  }

  try {
    if (definition.network && isLocalOnly()) throw new Error('LOCAL_ONLY_BLOCKED');
    const abort = new AbortController();
    const turn = { ...options.turn, signal: abort.signal, deadlineAt: Math.min(options.turn?.deadlineAt ?? Infinity, Date.now() + definition.timeoutMs) };
    const onAbort = () => abort.abort();
    options.turn?.signal?.addEventListener('abort', onAbort, { once: true });
    if (options.turn?.signal?.aborted) abort.abort();
    const unsubscribe = subscribeNetworkPolicy(() => { if (definition.network && isLocalOnly()) abort.abort(); });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let cancelled: (() => void) | undefined;
    try {
    const assertActive = () => {
      if (turn?.signal?.aborted) throw new Error('TURN_CANCELLED');
      if (turn?.deadlineAt !== undefined && Date.now() >= turn.deadlineAt) throw new Error('TURN_DEADLINE');
    };
    assertActive();
    if (turn?.reserveTool && !turn.reserveTool()) throw new Error('TOOL_BUDGET_EXCEEDED');
    const stopped = new Promise<never>((_, reject) => {
      cancelled = () => reject(new Error(isLocalOnly() && definition.network ? 'LOCAL_ONLY_BLOCKED' : 'TURN_CANCELLED'));
      abort.signal.addEventListener('abort', cancelled, { once: true });
      timeout = setTimeout(() => { reject(new Error('TOOL_TIMEOUT')); abort.abort(); }, Math.max(0, turn.deadlineAt - Date.now()));
    });
    const data = await Promise.race([definition.execute(parsed.data, turn), stopped]);
    assertActive();
    return { callId: call.id, tool: call.tool, ok: true, startedAt, finishedAt: Date.now(), data };
    } finally {
      if (timeout) clearTimeout(timeout);
      if (cancelled) abort.signal.removeEventListener('abort', cancelled);
      options.turn?.signal?.removeEventListener('abort', onAbort);
      unsubscribe();
    }
  } catch (error) {
    return {
      callId: call.id,
      tool: call.tool,
      ok: false,
      startedAt,
      finishedAt: Date.now(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
