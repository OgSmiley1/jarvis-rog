import { describe, expect, it } from 'vitest';
import { looksLikeToolRequest } from '@/lib/tools/planner';

describe('looksLikeToolRequest', () => {
  it('detects English action requests', () => {
    expect(looksLikeToolRequest('open my email')).toBe(true);
    expect(looksLikeToolRequest('show maps')).toBe(true);
  });

  it('detects Arabic action requests', () => {
    expect(looksLikeToolRequest('شوف لي الخريطة')).toBe(true);
    expect(looksLikeToolRequest('افتح الإيميل')).toBe(true);
  });

  it('leaves normal conversation alone', () => {
    expect(looksLikeToolRequest('tell me a story about time')).toBe(false);
  });
});
