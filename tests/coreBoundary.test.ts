import { describe, expect, it } from 'vitest';
import { FALLBACK_LOOKS, coreErrorState } from '@/lib/core/fallbackCore';
import type { HudState } from '@/lib/hud/hudState';

const STATES: HudState[] = ['OFFLINE', 'PREPARING', 'READY', 'LISTENING', 'THINKING', 'SPEAKING', 'TOOL_RUNNING', 'WATCHING', 'ERROR'];

describe('steady Core fallback', () => {
  it('has a look for every state', () => {
    for (const state of STATES) {
      expect(FALLBACK_LOOKS[state].ring).toMatch(/^#/);
      expect(FALLBACK_LOOKS[state].glow).toBeGreaterThan(0);
    }
  });

  it('turns any thrown value into a failed state with a bounded reason', () => {
    expect(coreErrorState(new Error('skia surface lost'))).toEqual({ failed: true, reason: 'skia surface lost' });
    expect(coreErrorState('x'.repeat(500)).reason).toHaveLength(200);
  });
});
