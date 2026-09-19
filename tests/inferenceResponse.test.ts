import { describe, expect, it } from 'vitest';
import { requireNonBlankCompletion } from '@/lib/inference/inferenceResponse';

describe('completion validation', () => {
  it('rejects blank output', () => {
    expect(() => requireNonBlankCompletion('   ')).toThrow('EMPTY_COMPLETION');
  });

  it('returns trimmed output', () => {
    expect(requireNonBlankCompletion(' hello ')).toBe('hello');
  });
});
