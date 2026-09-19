import type { IntelligenceMode, ModeConfig } from './types';

export const INTELLIGENCE_MODES: Record<IntelligenceMode, ModeConfig> = {
  fast: {
    label: 'Fast',
    maxTokens: 384,
    temperature: 0.35,
    topP: 0.9,
    topK: 40,
    instruction:
      'Act as a concise high-signal personal assistant. Answer directly, preserve continuity, and prefer immediately useful actions.',
  },
  deep: {
    label: 'Deep',
    maxTokens: 1536,
    temperature: 0.5,
    topP: 0.92,
    topK: 40,
    instruction:
      'Perform careful analysis. Identify assumptions, constraints, trade-offs, risks, and alternatives before the practical answer.',
  },
  create: {
    label: 'Create',
    maxTokens: 1024,
    temperature: 0.8,
    topP: 0.95,
    topK: 50,
    instruction:
      'Generate original but practical ideas. Avoid generic suggestions. Give distinct executable options.',
  },
  code: {
    label: 'Code',
    maxTokens: 2048,
    temperature: 0.25,
    topP: 0.9,
    topK: 30,
    instruction:
      'Act as a senior software engineer. Inspect architecture before editing, preserve working behavior, handle failures, and verify with tests and builds.',
  },
};
