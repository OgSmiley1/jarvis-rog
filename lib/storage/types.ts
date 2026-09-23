import type { IntelligenceMode, RuntimeMetrics } from '@/lib/inference/types';

export type MemoryType = 'preference' | 'fact' | 'project' | 'lesson' | 'mistake' | 'task' | 'note';
export type MemorySource = 'manual' | 'coach' | 'understand' | 'project' | 'imported';

export interface JarvisSettings {
  language: 'en' | 'ar';
  defaultMode: IntelligenceMode;
  approvedMemoryEnabled: boolean;
  autoSpeak: boolean;
  handsFreeEnabled: boolean;
  wakeWord: string;
  ownerProfile: string;
  contextSize: number;
  batchSize: number;
  threads: number;
  gpuLayers: number;
  /**
   * When true (the default), the runtime is sized from the device's observed
   * power and memory state instead of the fixed values above. Turning it off
   * pins the runtime to the explicit contextSize/batchSize/threads/gpuLayers.
   */
  adaptiveRuntime: boolean;
  modelPath?: string;
  modelName?: string;
  modelSize?: number;
  onlineFreeOnly: boolean;
  onlineModelId?: string;
  /**
   * A specific system voice the owner pinned in Settings. When unset, JARVIS
   * ranks the installed voices and picks the best neural one for the language.
   * If a pinned voice is later uninstalled, ranking takes over again.
   */
  ttsVoiceId?: string;
  /**
   * Allow Google's server-synthesised `-network` voices. They sound the best
   * but need internet and add round-trip latency, so a local-first assistant
   * leaves this off by default.
   */
  ttsAllowNetworkVoice: boolean;
  /**
   * Answer through the owner's free cloud keys (Cerebras → Groq → Gemini)
   * when the local model is not loaded. Off by default: turning it on means a
   * question can leave the phone, and that has to be the owner's choice. The
   * keys themselves are in the Android keystore, never in these settings.
   */
  cloudFallbackEnabled: boolean;
  /**
   * Keep the floating JARVIS orb over other apps. Only takes effect once the
   * owner has granted "Display over other apps"; JARVIS never assumes it.
   */
  floatingOrbEnabled: boolean;
  /**
   * Speak English replies with Kokoro, an on-device neural voice (British,
   * "Daniel"). About 351 MB, downloaded once when switched on. Arabic keeps
   * the phone's best voice: Kokoro has no Arabic model.
   */
  neuralVoiceEnabled: boolean;
  /** Per-provider model overrides; unset uses the provider's default. */
  cloudModels?: Partial<Record<'cerebras' | 'groq' | 'gemini', string>>;
  /**
   * Where the live test link posts: a private GitHub repository, and
   * optionally an issue or PR number in it (unset opens one issue per
   * session). The token is in the Android keystore, never here.
   */
  liveChannel?: { owner: string; repo: string; number?: number };
}

export interface MemoryRecord {
  id: string;
  title: string;
  body: string;
  type: MemoryType;
  source: MemorySource;
  approved: boolean;
  pinned: boolean;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface JarvisProject {
  id: string;
  name: string;
  objective: string;
  status: 'active' | 'paused' | 'completed';
  lastCompletedStep?: string;
  nextAction?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectStep {
  id: string;
  projectId: string;
  sequence: number;
  description: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  result?: string;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  mode?: IntelligenceMode;
  metrics?: RuntimeMetrics;
}

export interface OnlineChatRecord {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  modelId?: string;
  createdAt: number;
}
