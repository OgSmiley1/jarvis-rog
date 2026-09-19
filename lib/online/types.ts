export type OnlineBridgeStatus = 'loading' | 'ready' | 'signed_out' | 'signed_in' | 'error';

export interface OnlineModelCost {
  currency?: string;
  tokens?: number;
  input?: number;
  output?: number;
}

export interface OnlineModel {
  id: string;
  provider: string;
  providerLabel: string;
  name: string;
  aliases: string[];
  context?: number;
  maxTokens?: number;
  cost?: OnlineModelCost;
  freeVariant: boolean;
}

export interface OnlineChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OnlineUser {
  username?: string;
  email?: string;
  uuid?: string;
}

export interface PuterBridgeEvent {
  type:
    | 'bridge_ready'
    | 'auth_state'
    | 'models'
    | 'chat_chunk'
    | 'chat_done'
    | 'chat_error'
    | 'usage'
    | 'signed_out'
    | 'bridge_error';
  requestId?: string;
  payload?: unknown;
}
