export type IntelligenceMode = 'fast' | 'deep' | 'create' | 'code';

export interface ModeConfig {
  label: string;
  maxTokens: number;
  temperature: number;
  topP: number;
  topK: number;
  instruction: string;
}

export interface RuntimeMetrics {
  firstTokenMs?: number;
  totalMs: number;
  generatedTokens?: number;
  tokensPerSecond?: number;
  nativeTimings?: unknown;
}

export interface CompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ModelRuntimeState {
  status: 'unloaded' | 'loading' | 'ready' | 'error';
  modelPath?: string;
  modelName?: string;
  gpu?: boolean;
  reasonNoGPU?: string;
  devices?: unknown;
  error?: string;
}

export interface RunCompletionInput {
  messages: CompletionMessage[];
  mode: IntelligenceMode;
  onToken?: (token: string) => void;
}
