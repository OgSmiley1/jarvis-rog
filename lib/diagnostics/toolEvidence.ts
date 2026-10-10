import type { ToolResult } from '@/lib/tools/types';

/** One observation per registered feature; no payloads or personal data retained. */
const evidence = new Map<string, { ok: boolean; error?: string; at: number; ms: number }>();
export function observeToolResult(result: ToolResult): ToolResult {
  evidence.set(result.tool, { ok: result.ok, error: result.error, at: result.finishedAt, ms: result.finishedAt - result.startedAt });
  return result;
}
export function toolEvidence(name: string) { return evidence.get(name); }
