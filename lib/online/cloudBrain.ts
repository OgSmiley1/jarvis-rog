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

export type CloudProviderId = 'cerebras' | 'groq' | 'gemini';

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
  /** Where the owner creates the free key. */
  keyUrl: string;
}

export const CLOUD_PROVIDERS: readonly CloudProvider[] = [
  {
    id: 'cerebras',
    name: 'Cerebras',
    endpoint: 'https://api.cerebras.ai/v1/chat/completions',
    defaultModel: 'llama-3.3-70b',
    keyUrl: 'https://cloud.cerebras.ai/',
  },
  {
    id: 'groq',
    name: 'Groq',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    defaultModel: 'llama-3.1-8b-instant',
    keyUrl: 'https://console.groq.com/keys',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    defaultModel: 'gemini-2.5-flash',
    keyUrl: 'https://aistudio.google.com/apikey',
  },
] as const;

export type CloudKeys = Partial<Record<CloudProviderId, string>>;
export type CloudModels = Partial<Record<CloudProviderId, string>>;

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

/** Providers that can actually be tried: in the configured order, with a key. */
export function usableProviders(keys: CloudKeys): CloudProvider[] {
  return CLOUD_PROVIDERS.filter((provider) => Boolean(keys[provider.id]?.trim()));
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
  return content.trim();
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
  now?: () => number;
}

export async function askCloud(input: AskCloudInput): Promise<CloudAnswer> {
  const now = input.now ?? (() => Date.now());
  const timeoutMs = input.timeoutMs ?? 12_000;
  const attempts: CloudAttempt[] = [];
  const startedAt = now();

  for (const provider of usableProviders(input.keys)) {
    const model = input.models?.[provider.id]?.trim() || provider.defaultModel;
    const key = input.keys[provider.id]!.trim();
    const attemptStartedAt = now();
    const controller = typeof AbortController === 'function' ? new AbortController() : undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller?.abort();
          reject(new Error('timed out'));
        }, timeoutMs);
      });

      const response = await Promise.race([
        input.fetchImpl(provider.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify(buildChatBody(model, input.messages, input.mode)),
          signal: controller?.signal,
        }),
        timeout,
      ]);

      if (!response.ok) throw new Error(describeHttpFailure(response.status));
      const text = extractText(await Promise.race([response.text(), timeout]));
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
      attempts.push({
        provider: provider.id,
        model,
        ok: false,
        ms: now() - attemptStartedAt,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  throw new CloudBrainUnavailableError(attempts);
}
