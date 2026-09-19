import { describe, expect, it } from 'vitest';
import { parseStructuredUnderstanding } from '@/lib/understand/communicationIntelligence';

const raw = `SITUATION:\nTest\nOBJECTIVE:\nWin\nFACTS:\n- A\nRISKS:\n- B\nMISSING INFORMATION:\n- C\nQUESTIONS:\n- D\nACTIONS:\n- E\nDRAFT REPLY:\nHello`;

describe('structured parser', () => {
  it('parses strict sections', () => {
    const result = parseStructuredUnderstanding(raw);
    expect(result.situation).toBe('Test');
    expect(result.actions).toEqual(['E']);
  });

  it('rejects missing sections', () => {
    expect(() => parseStructuredUnderstanding('SITUATION: x')).toThrow();
  });
});
