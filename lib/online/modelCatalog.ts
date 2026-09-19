import type { OnlineModel } from './types';

const LABELS: Record<string, string> = {
  openai: 'OpenAI / GPT',
  google: 'Google / Gemini',
  xai: 'xAI / Grok',
  grok: 'xAI / Grok',
  anthropic: 'Anthropic / Claude',
  claude: 'Anthropic / Claude',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
  alibaba: 'Qwen / Alibaba',
  mistral: 'Mistral',
  meta: 'Meta / Llama',
  openrouter: 'OpenRouter',
  zai: 'Z.AI / GLM',
  'z.ai': 'Z.AI / GLM',
};

function normalizeProvider(value: unknown, id: string): string {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw) return raw;
  const prefix = id.split('/')[0]?.toLowerCase() ?? '';
  return prefix || 'other';
}

export function providerLabel(provider: string): string {
  return LABELS[provider.toLowerCase()] ?? provider.replace(/(^|[-_])\w/g, (value) => value.replace(/[-_]/, '').toUpperCase());
}

export function normalizeOnlineModel(raw: any): OnlineModel | undefined {
  const id = String(raw?.id ?? '').trim();
  if (!id) return undefined;
  const provider = normalizeProvider(raw?.provider, id);
  const name = String(raw?.name ?? id).trim() || id;
  const aliases = Array.isArray(raw?.aliases) ? raw.aliases.map(String).filter(Boolean) : [];
  const context = Number.isFinite(Number(raw?.context)) ? Number(raw.context) : undefined;
  const maxTokens = Number.isFinite(Number(raw?.max_tokens)) ? Number(raw.max_tokens) : undefined;
  const freeVariant = id.endsWith(':free') || raw?.variant === 'free' || raw?.free === true;
  const cost = raw?.cost && typeof raw.cost === 'object'
    ? {
        currency: raw.cost.currency ? String(raw.cost.currency) : undefined,
        tokens: Number.isFinite(Number(raw.cost.tokens)) ? Number(raw.cost.tokens) : undefined,
        input: Number.isFinite(Number(raw.cost.input)) ? Number(raw.cost.input) : undefined,
        output: Number.isFinite(Number(raw.cost.output)) ? Number(raw.cost.output) : undefined,
      }
    : undefined;

  return {
    id,
    provider,
    providerLabel: providerLabel(provider),
    name,
    aliases,
    context,
    maxTokens,
    cost,
    freeVariant,
  };
}

export function normalizeOnlineModels(raw: unknown): OnlineModel[] {
  if (!Array.isArray(raw)) return [];
  const unique = new Map<string, OnlineModel>();
  for (const item of raw) {
    const model = normalizeOnlineModel(item);
    if (model) unique.set(model.id, model);
  }
  return [...unique.values()].sort((a, b) => {
    if (a.freeVariant !== b.freeVariant) return a.freeVariant ? -1 : 1;
    const providerCompare = a.providerLabel.localeCompare(b.providerLabel);
    return providerCompare || a.name.localeCompare(b.name);
  });
}

export function filterOnlineModels(
  models: OnlineModel[],
  options: { freeOnly: boolean; provider?: string; query?: string },
): OnlineModel[] {
  const query = options.query?.trim().toLowerCase() ?? '';
  return models.filter((model) => {
    if (options.freeOnly && !model.freeVariant) return false;
    if (options.provider && model.provider !== options.provider) return false;
    if (!query) return true;
    return [model.id, model.name, model.provider, model.providerLabel, ...model.aliases]
      .join(' ')
      .toLowerCase()
      .includes(query);
  });
}

export function listProviders(models: OnlineModel[]): Array<{ id: string; label: string; count: number; freeCount: number }> {
  const grouped = new Map<string, { id: string; label: string; count: number; freeCount: number }>();
  for (const model of models) {
    const current = grouped.get(model.provider) ?? {
      id: model.provider,
      label: model.providerLabel,
      count: 0,
      freeCount: 0,
    };
    current.count += 1;
    if (model.freeVariant) current.freeCount += 1;
    grouped.set(model.provider, current);
  }
  return [...grouped.values()].sort((a, b) => b.freeCount - a.freeCount || b.count - a.count || a.label.localeCompare(b.label));
}

export function pickDefaultFreeModel(models: OnlineModel[]): OnlineModel | undefined {
  const free = models.filter((model) => model.freeVariant);
  if (!free.length) return undefined;
  const preferences = ['openai', 'google', 'xai', 'grok', 'anthropic', 'claude', 'deepseek', 'qwen', 'mistral', 'meta'];
  for (const preferred of preferences) {
    const match = free.find((model) => model.provider === preferred || model.id.toLowerCase().includes(preferred));
    if (match) return match;
  }
  return free[0];
}

export interface AutoRouteResult {
  model?: OnlineModel;
  reason: string;
}

export function pickAutoFreeModel(prompt: string, models: OnlineModel[]): AutoRouteResult {
  const free = models.filter((model) => model.freeVariant);
  if (!free.length) return { reason: 'No explicit free variants are currently available.' };

  const text = prompt.toLowerCase();
  const codeTask = /\b(code|coding|bug|debug|typescript|javascript|python|react|android|kotlin|swift|sql|api|compile|repository|github)\b/.test(text);
  const creativeTask = /\b(creative|brainstorm|story|design|image|visual|logo|concept|marketing|caption|video)\b/.test(text);
  const reasoningTask = /\b(analy[sz]e|reason|compare|strategy|plan|deep|research|trade[- ]?off|architecture)\b/.test(text);

  const score = (model: OnlineModel): number => {
    const haystack = `${model.id} ${model.name} ${model.provider}`.toLowerCase();
    let value = 0;
    if (codeTask) {
      if (/coder|code/.test(haystack)) value += 14;
      if (/qwen|deepseek|openai|gpt/.test(haystack)) value += 7;
    }
    if (creativeTask) {
      if (/gemini|google|grok|xai|gpt|openai/.test(haystack)) value += 8;
      if (/vision|image|multimodal/.test(haystack)) value += 5;
    }
    if (reasoningTask) {
      if (/reason|thinking|deepseek|gpt|gemini|claude|qwen/.test(haystack)) value += 8;
    }
    if (/openai|google|xai|anthropic|claude|deepseek|qwen|mistral|meta/.test(haystack)) value += 2;
    return value;
  };

  const ranked = [...free].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
  const model = ranked[0];
  const reason = codeTask
    ? 'Auto-Free routed this as a coding/technical task.'
    : creativeTask
      ? 'Auto-Free routed this as a creative/multimodal task.'
      : reasoningTask
        ? 'Auto-Free routed this as an analysis/reasoning task.'
        : 'Auto-Free selected a general-purpose explicit free variant.';
  return { model, reason };
}
