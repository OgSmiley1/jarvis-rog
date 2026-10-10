import { assertNetworkAllowed, isLocalOnly } from '@/lib/net/localOnly';
import { stripThinking } from '@/lib/voice/stripThinking';
import { INTELLIGENCE_MODES } from '@/lib/inference/intelligenceModes';
import type { CompletionMessage, IntelligenceMode, RuntimeMetrics } from '@/lib/inference/types';

/**
 * The cloud brain: a fallback that answers when the local model is not loaded.
 *
 * Observed on the owner's ROG (Build e6e0246): speech recognition READY, the
 * orb LISTENING, and `Model: Not selected`. Every question died at
 * `runCompletion`, which throws MODEL_NOT_LOADED. The local brain is a 2.5 GB
 * download; until it is on the phone, JARVIS had nothing to answer with.
 *
 * Three providers with free tiers and OpenAI-compatible chat endpoints, tried
 * in order until one answers. Deliberate choices:
 *
 * - **Opt-in and local-first.** This only runs when the owner turns it on AND
 *   the local model is not ready. A loaded local brain always answers first,
 *   and nothing is sent anywhere unless the owner enabled this.
 * - **The owner's own keys.** Each provider's free key is created by the
 *   owner and kept in the Android keystore via expo-secure-store. No key is
 *   ever in the repository or the APK.
 * - **Not streamed.** React Native's fetch does not expose a readable response
 *   body, and these providers answer a short spoken reply in well under a
 *   second, so the whole reply is fetched and then handed to the same sentence
 *   segmenter the local path uses. Nothing pretends to stream.
 * - **Every attempt is reported.** When all providers fail, the error names
 *   each one and why, so "the cloud is down" is never the whole explanation.
 *
 * Pure: `fetch` is injected, so the whole failover is tested off-device.
 */

import { checkProvider, recordPolicy } from '@/lib/net/providerPolicy';

export type CloudProviderId = 'cerebras' | 'groq' | 'gemini' | 'deepinfra' | 'ollama';

export interface CloudProvider {
  id: CloudProviderId;
  name: string;
  endpoint: string;
  /**
   * Model identifiers change as providers retire them. These are defaults the
   * owner can override in Settings; a retired model surfaces as a named
   * "model not found" error rather than a silent failure.
   */
  defaultModel: string;
  /** Where the owner creates the free key. All three free tiers need no card. */
  keyUrl: string;
  /** True when the free tier may use prompts for training: skipped unless the owner allows it. */
  trainsOnPrompts: boolean;
  /** Ollama runs without a key; every hosted provider still requires one. */
  requiresKey?: boolean;
}

export const CLOUD_PROVIDERS: readonly CloudProvider[] = [
  {
    id: 'groq',
    name: 'Groq',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    defaultModel: 'llama-3.3-70b-versatile',
    keyUrl: 'https://console.groq.com/keys',
    trainsOnPrompts: false,
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    endpoint: 'https://api.cerebras.ai/v1/chat/completions',
    defaultModel: 'llama-3.3-70b',
    keyUrl: 'https://cloud.cerebras.ai/',
    trainsOnPrompts: false,
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    defaultModel: 'gemini-2.5-flash',
    keyUrl: 'https://aistudio.google.com/apikey',
    // Google's free tier may use prompts to improve its products.
    trainsOnPrompts: true,
  },
  {
    id: 'deepinfra',
    name: 'DeepInfra',
    endpoint: 'https://api.deepinfra.com/v1/openai/chat/completions',
    defaultModel: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
    keyUrl: 'https://deepinfra.com/dash/api_keys',
    // DeepInfra may provide promotional/free credits, but availability and
    // balance are account-dependent. The UI labels this clearly; JARVIS never
    // assumes that a paid fallback is available.
    trainsOnPrompts: false,
  },
  {
    id: 'ollama',
    name: 'Ollama (local)',
    endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
    defaultModel: 'llama3.2:3b',
    keyUrl: '',
    trainsOnPrompts: false,
    requiresKey: false,
  },
] as const;

export type CloudKeys = Partial<Record<CloudProviderId, string>>;
export type CloudModels = Partial<Record<CloudProviderId, string>>;
export type CloudEndpoints = Partial<Record<CloudProviderId, string>>;

export interface CloudAttempt {
  provider: CloudProviderId;
  model: string;
  ok: boolean;
  ms: number;
  error?: string;
}

export interface CloudAnswer {
  text: string;
  provider: CloudProviderId;
  model: string;
  attempts: CloudAttempt[];
  metrics: RuntimeMetrics;
}

export type FetchLike = (url: string, init: {
  method: string;
  headers: Record<string, string>;
  body: string;
  signal?: AbortSignal;
}) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export class CloudBrainUnavailableError extends Error {
  readonly attempts: CloudAttempt[];

  constructor(attempts: CloudAttempt[]) {
    super(
      attempts.length === 0
        ? 'CLOUD_NO_KEYS'
        : `CLOUD_ALL_FAILED: ${attempts.map((attempt) => `${attempt.provider} (${attempt.error ?? 'failed'})`).join('; ')}`,
    );
    this.name = 'CloudBrainUnavailableError';
    this.attempts = attempts;
  }
}

export function providerById(id: CloudProviderId): CloudProvider {
  const provider = CLOUD_PROVIDERS.find((candidate) => candidate.id === id);
  if (!provider) throw new Error(`Unknown cloud provider: ${id}`);
  return provider;
}

/**
 * Providers that can actually be tried: in order, with a key, and — unless
 * the owner allowed it — only those whose free tier does not train on prompts.
 */
export function usableProviders(keys: CloudKeys, allowTraining = false, options: { ollamaEnabled?: boolean } = {}): CloudProvider[] {
  return CLOUD_PROVIDERS.filter(
    (provider) => (provider.requiresKey === false
      ? provider.id === 'ollama' && options.ollamaEnabled === true
      : Boolean(keys[provider.id]?.trim()))
      && (allowTraining || !provider.trainsOnPrompts),
  );
}

function providerEndpoint(provider: CloudProvider, endpoints: CloudEndpoints | undefined): string {
  const configured = endpoints?.[provider.id]?.trim();
  if (provider.id !== 'ollama' || !configured) return provider.endpoint;
  const base = new URL(configured);
  if (base.protocol !== 'http:' && base.protocol !== 'https:') throw new Error('OLLAMA_ENDPOINT_PROTOCOL');
  const path = base.pathname.replace(/\/+$/, '');
  base.pathname = path.endsWith('/v1/chat/completions') ? path : `${path || ''}/v1/chat/completions`;
  base.search = '';
  base.hash = '';
  return base.toString();
}

function loopbackEndpoint(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' && (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '::1') && parsed.port === '11434';
  } catch {
    return false;
  }
}

export function buildChatBody(model: string, messages: CompletionMessage[], mode: IntelligenceMode): Record<string, unknown> {
  const config = INTELLIGENCE_MODES[mode];
  return {
    model,
    messages,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    top_p: config.topP,
    stream: false,
  };
}

/**
 * The assistant text from an OpenAI-compatible response, or throws. An empty
 * reply is treated as a failure so the next provider is tried — speaking
 * silence is worse than a slightly slower answer.
 */
export function extractText(raw: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('malformed response');
  }

  const content = (parsed as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('empty reply');
  const visible = stripThinking(content);
  if (!visible) throw new Error('empty reply after reasoning filter');
  return visible;
}

/** A short, owner-readable reason for an HTTP failure. */
export function describeHttpFailure(status: number): string {
  if (status === 401 || status === 403) return 'key rejected';
  if (status === 404) return 'model not found — change it in Settings';
  if (status === 408) return 'timed out';
  if (status === 413) return 'request too large';
  if (status === 429) return 'rate limited';
  if (status >= 500) return `provider error ${status}`;
  return `HTTP ${status}`;
}

export interface AskCloudInput {
  messages: CompletionMessage[];
  mode: IntelligenceMode;
  keys: CloudKeys;
  models?: CloudModels;
  fetchImpl: FetchLike;
  /** Per-provider budget. A voice assistant cannot wait long on one host. */
  timeoutMs?: number;
  /** Bound spoken replies so generation and speech can finish promptly. */
  maxTokens?: number;
  /** Include providers whose free tier may train on prompts (Gemini). Default false. */
  allowTraining?: boolean;
  /** Enable the no-key Ollama server configured on this phone. */
  ollamaEnabled?: boolean;
  /** Optional Ollama base URL, defaulting to http://127.0.0.1:11434. */
  endpoints?: CloudEndpoints;
  /** Cancellation and total deadline from the owning voice turn. */
  signal?: AbortSignal;
  deadlineAt?: number;
  now?: () => number;
}

export async function askCloud(input: AskCloudInput): Promise<CloudAnswer> {
  const now = input.now ?? (() => Date.now());
  const timeoutMs = input.timeoutMs ?? 12_000;
  const attempts: CloudAttempt[] = [];
  const startedAt = now();

  const configuredOllamaEndpoint = input.endpoints?.ollama?.trim() || 'http://127.0.0.1:11434';
  const assertActive = (providerId?: CloudProviderId) => {
    const localOllama = (providerId === undefined || providerId === 'ollama') && input.ollamaEnabled === true && loopbackEndpoint(`${configuredOllamaEndpoint.replace(/\/+$/, '')}/v1/chat/completions`);
    if (!localOllama) assertNetworkAllowed();
    if (input.signal?.aborted) throw Object.assign(new Error('TURN_CANCELLED'), { name: 'AbortError' });
    if (input.deadlineAt !== undefined && now() >= input.deadlineAt) throw new Error('TURN_DEADLINE');
  };
  assertActive();

  for (const provider of usableProviders(input.keys, input.allowTraining, { ollamaEnabled: input.ollamaEnabled })) {
    if (isLocalOnly() && provider.id !== 'ollama') {
      attempts.push({ provider: provider.id, model: input.models?.[provider.id]?.trim() || provider.defaultModel, ok: false, ms: 0, error: 'LOCAL_ONLY_BLOCKED' });
      continue;
    }
    assertActive(provider.id);
    // The zero-cost policy has the last word on every provider, every call.
    const decision = checkProvider(provider.id, { strict: true, allowTraining: input.allowTraining });
    recordPolicy(provider.id, decision.allowed);
    if (!decision.allowed) {
      attempts.push({ provider: provider.id, model: '', ok: false, error: decision.reason, ms: 0 });
      continue;
    }
    const model = input.models?.[provider.id]?.trim() || provider.defaultModel;
    const key = input.keys[provider.id]?.trim();
    let endpoint: string;
    try {
      endpoint = providerEndpoint(provider, input.endpoints);
    } catch (error) {
      attempts.push({ provider: provider.id, model, ok: false, ms: 0, error: error instanceof Error ? error.message : String(error) });
      continue;
    }
    if (provider.id === 'ollama' && isLocalOnly() && !loopbackEndpoint(endpoint)) {
      attempts.push({ provider: provider.id, model, ok: false, ms: 0, error: 'LOCAL_ONLY_BLOCKED' });
      continue;
    }
    const attemptStartedAt = now();
    const controller = typeof AbortController === 'function' ? new AbortController() : undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let rejectCancelled: (error: Error) => void = () => undefined;
    const cancelled = new Promise<never>((_, reject) => { rejectCancelled = reject; });
    const onAbort = () => {
      controller?.abort();
      rejectCancelled(Object.assign(new Error('TURN_CANCELLED'), { name: 'AbortError' }));
    };
    input.signal?.addEventListener('abort', onAbort, { once: true });

    try {
      assertActive(provider.id);
      const remainingMs = input.deadlineAt === undefined ? timeoutMs : input.deadlineAt - now();
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller?.abort();
          const deadlineReached = input.deadlineAt !== undefined && remainingMs <= timeoutMs;
          reject(new Error(deadlineReached ? 'TURN_DEADLINE' : 'timed out'));
        }, Math.min(timeoutMs, remainingMs));
      });

      const response = await Promise.race([
        input.fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(key ? { Authorization: `Bearer ${key}` } : {}),
          },
          body: JSON.stringify({ ...buildChatBody(model, input.messages, input.mode), ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}) }),
          signal: controller?.signal,
        }),
        timeout,
        cancelled,
      ]);

      if (!response.ok) throw new Error(describeHttpFailure(response.status));
      const text = extractText(await Promise.race([response.text(), timeout, cancelled]));
      assertActive(provider.id);
      const ms = now() - attemptStartedAt;
      attempts.push({ provider: provider.id, model, ok: true, ms });

      return {
        text,
        provider: provider.id,
        model,
        attempts,
        metrics: { totalMs: now() - startedAt },
      };
    } catch (error) {
      assertActive(provider.id);
      if (error instanceof Error && error.message === 'TURN_DEADLINE') throw error;
      attempts.push({
        provider: provider.id,
        model,
        ok: false,
        ms: now() - attemptStartedAt,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (timer) clearTimeout(timer);
      input.signal?.removeEventListener('abort', onAbort);
    }
  }

  throw new CloudBrainUnavailableError(attempts);
}
