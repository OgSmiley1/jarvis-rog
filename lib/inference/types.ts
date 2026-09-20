export type IntelligenceMode = 'fast' | 'deep' | 'create' | 'code';

/** Language the model must answer in. Mirrors JarvisSettings.language. */
export type ResponseLanguage = 'en' | 'ar';

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
  /**
   * Optional GBNF grammar. When present the sampler can only emit tokens that
   * keep the output within the grammar, which is how tool calls are made
   * structurally valid by construction rather than by parsing and hoping.
   */
  grammar?: string;
}
