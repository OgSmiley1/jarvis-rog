import { describe, expect, it } from 'vitest';
import { formatPerformance } from '@/lib/inference/performance';

it('only formats provided measurements', () => {
  expect(formatPerformance({ totalMs: 1000, tokensPerSecond: 12.34 })).toContain('12.3 tok/s');
  expect(formatPerformance()).toBe('No runtime measurement yet');
});
