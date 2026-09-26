import { describe, expect, it } from 'vitest';
import { FILLER_AFTER_MS, thinkingFiller } from '@/lib/voice/thinkingFiller';

describe('thinking filler', () => {
  it('opens with the reference line and rotates per turn', () => {
    expect(thinkingFiller('en', 0)).toBe('Let me think about that for you.');
    expect(thinkingFiller('en', 1)).not.toBe(thinkingFiller('en', 0));
    expect(thinkingFiller('en', 4)).toBe(thinkingFiller('en', 0));
  });

  it('speaks Arabic when JARVIS does', () => {
    expect(thinkingFiller('ar', 0)).toBe('دعني أفكر في ذلك.');
    expect(thinkingFiller('ar', 7)).toMatch(/[؀-ۿ]/u);
  });

  it('never throws on odd turn numbers', () => {
    expect(thinkingFiller('en', -3)).toBeTruthy();
    expect(thinkingFiller('fr', 2.7)).toBeTruthy();
  });

  it('waits long enough that a fast answer gets no filler', () => {
    expect(FILLER_AFTER_MS).toBeGreaterThanOrEqual(1000);
    expect(FILLER_AFTER_MS).toBeLessThanOrEqual(2000);
  });
});
