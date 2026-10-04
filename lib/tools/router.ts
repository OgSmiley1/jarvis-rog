import { toolRegistry } from './registry';
import { profileFor } from './toolProfiles';
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
    const turn = options.turn;
    const assertActive = () => {
      if (turn?.signal?.aborted) throw new Error('TURN_CANCELLED');
      if (turn?.deadlineAt !== undefined && Date.now() >= turn.deadlineAt) throw new Error('TURN_DEADLINE');
    };
    assertActive();
    if (turn?.reserveTool && !turn.reserveTool()) throw new Error('TOOL_BUDGET_EXCEEDED');
    // Each tool's own limit (toolProfiles.ts), inside the turn's deadline: a
    // stuck intent or provider is reported, never left hanging the turn.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const limit = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('TOOL_TIMEOUT')), profileFor(call.tool).timeoutMs);
    });
    const data = await Promise.race([definition.execute(parsed.data, turn), limit]).finally(() => clearTimeout(timer));
    assertActive();
    return { callId: call.id, tool: call.tool, ok: true, startedAt, finishedAt: Date.now(), data };
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
