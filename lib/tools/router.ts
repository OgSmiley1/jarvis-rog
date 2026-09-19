import { toolRegistry } from './registry';
import type { JarvisToolCall, ToolResult } from './types';

export interface ExecuteToolOptions {
  confirmed?: boolean;
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
    const data = await definition.execute(parsed.data);
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
