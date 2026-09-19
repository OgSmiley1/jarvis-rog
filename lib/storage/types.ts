import type { IntelligenceMode, RuntimeMetrics } from '@/lib/inference/types';

export type MemoryType = 'preference' | 'fact' | 'project' | 'lesson' | 'mistake' | 'task' | 'note';
export type MemorySource = 'manual' | 'coach' | 'understand' | 'project' | 'imported';

export interface JarvisSettings {
  language: 'en' | 'ar';
  defaultMode: IntelligenceMode;
  approvedMemoryEnabled: boolean;
  autoSpeak: boolean;
  contextSize: number;
  batchSize: number;
  threads: number;
  gpuLayers: number;
  modelPath?: string;
  modelName?: string;
  modelSize?: number;
  onlineFreeOnly: boolean;
  onlineModelId?: string;
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
