import type { z } from 'zod';

export type ToolTarget = 'ANDROID' | 'TERMUX' | 'SHIZUKU';
export type ToolConfirmation = 'none' | 'required';

export interface JarvisToolCall {
  id: string;
  tool: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  callId: string;
  tool: string;
  ok: boolean;
  startedAt: number;
  finishedAt: number;
  data?: unknown;
  error?: string;
}

export interface ToolDefinition<TSchema extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  target: ToolTarget;
  confirmation: ToolConfirmation;
  schema: TSchema;
  execute: (input: z.infer<TSchema>) => Promise<unknown>;
}
