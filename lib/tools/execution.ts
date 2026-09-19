import { executeTool, type ExecuteToolOptions } from './router';
import type { JarvisToolCall, ToolResult } from './types';
import { recordToolRun } from '@/lib/storage/database';

export async function executeToolWithAudit(
  call: JarvisToolCall,
  options: ExecuteToolOptions = {},
): Promise<ToolResult> {
  const result = await executeTool(call, options);
  try {
    await recordToolRun({
      id: result.callId,
      tool: result.tool,
      ok: result.ok,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      data: result.data,
      error: result.error,
    });
  } catch {
    // Never rewrite a genuine tool outcome solely because audit persistence failed.
  }
  return result;
}
