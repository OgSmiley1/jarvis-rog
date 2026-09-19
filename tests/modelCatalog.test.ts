import { describe, expect, it } from 'vitest';
import { filterOnlineModels, normalizeOnlineModels, pickAutoFreeModel, pickDefaultFreeModel } from '@/lib/online/modelCatalog';

describe('online model catalog', () => {
  const models = normalizeOnlineModels([
    { id: 'openai/gpt-demo:free', provider: 'openai', name: 'GPT Demo' },
    { id: 'google/gemini-demo', provider: 'google', name: 'Gemini Demo' },
    { id: 'xai/grok-demo:free', provider: 'xai', name: 'Grok Demo' },
    { id: '', provider: 'bad' },
  ]);

  it('normalizes and detects explicit free variants', () => {
    expect(models).toHaveLength(3);
    expect(models.filter((model) => model.freeVariant)).toHaveLength(2);
  });

  it('keeps free-only truly free', () => {
    const free = filterOnlineModels(models, { freeOnly: true });
    expect(free.every((model) => model.id.endsWith(':free'))).toBe(true);
  });

  it('prefers a free model', () => {
    expect(pickDefaultFreeModel(models)?.id).toBe('openai/gpt-demo:free');
  });

  it('auto-routes only to an explicit free variant', () => {
    const result = pickAutoFreeModel('debug my TypeScript React code', models);
    expect(result.model?.freeVariant).toBe(true);
  });
});
