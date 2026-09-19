import { describe, expect, it } from 'vitest';
import { INTELLIGENCE_MODES } from '@/lib/inference/intelligenceModes';

describe('intelligence modes', () => {
  it('defines all four modes', () => {
    expect(Object.keys(INTELLIGENCE_MODES).sort()).toEqual(['code', 'create', 'deep', 'fast']);
  });

  it('keeps fast smaller than deep', () => {
    expect(INTELLIGENCE_MODES.fast.maxTokens).toBeLessThan(INTELLIGENCE_MODES.deep.maxTokens);
  });
});
