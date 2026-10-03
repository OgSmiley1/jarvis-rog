import { describe, expect, it } from 'vitest';
import {
  BLOOM_RED,
  BURST_PARTICLES,
  CORE_PRESETS,
  MAX_PARTICLES,
  adjustParams,
  bloomedRed,
  interactionFor,
  lerpParams,
  makeSpokes,
  particleBudget,
  readoutFor,
  ringVisibility,
  speechActivity,
  streaksAt,
} from '@/lib/core/CorePresets';

describe('Core presets (guide §2)', () => {
  it('matches the guide values exactly', () => {
    expect(CORE_PRESETS.idle).toEqual({ rings: 3, ringGap: 34, spokeDensity: 0.18, sweepSpeed: 0.05, tealOpacity: 0.25, hubGlow: 0.35, breathAmp: 6, breathPeriod: 4, redIntensity: 0.55 });
    expect(CORE_PRESETS.thinking.sweepSpeed).toBe(1.2);
    expect(CORE_PRESETS.speaking.spokeDensity).toBe(0.75);
    expect(CORE_PRESETS.listening.tealOpacity).toBe(1);
    expect(Object.keys(CORE_PRESETS)).toHaveLength(7);
  });

  it('maps every HUD state to an interaction state', () => {
    expect(interactionFor('READY')).toBe('idle');
    expect(interactionFor('OFFLINE')).toBe('idle');
    expect(interactionFor('LISTENING')).toBe('listening');
    expect(interactionFor('LISTENING', true)).toBe('transcribing');
    expect(interactionFor('TOOL_RUNNING')).toBe('thinking');
    expect(interactionFor('SPEAKING')).toBe('speaking');
    expect(interactionFor('ERROR')).toBe('error');
  });

  it('interpolates smoothly and clamps', () => {
    const mid = lerpParams(CORE_PRESETS.idle, CORE_PRESETS.thinking, 0.5);
    expect(mid.rings).toBe(4);
    expect(lerpParams(CORE_PRESETS.idle, CORE_PRESETS.thinking, 2)).toEqual(CORE_PRESETS.thinking);
  });

  it('offline dims red to 70%; thermal caps rings, spokes and sweep', () => {
    expect(adjustParams(CORE_PRESETS.speaking, true, false).redIntensity).toBeCloseTo(0.7);
    const hot = adjustParams(CORE_PRESETS.thinking, false, true);
    expect(hot).toMatchObject({ rings: 2, spokeDensity: 0.2, sweepSpeed: 0.05 });
    expect(hot.hubGlow).toBeGreaterThan(0); // never a black screen
  });

  it('wake bloom peaks at 1.6 and is gone after 400 ms', () => {
    expect(bloomedRed(0.55, 0)).toBe(BLOOM_RED);
    expect(bloomedRed(0.55, 200)).toBeGreaterThan(0.55);
    expect(bloomedRed(0.55, 401)).toBe(0.55);
  });

  it('fades the boundary ring as the count changes', () => {
    expect(ringVisibility(3, 0)).toBe(1);
    expect(ringVisibility(3.5, 3)).toBe(0.5);
    expect(ringVisibility(3, 4)).toBe(0);
  });
});

describe('spokes and speech activity', () => {
  it('360 seeded spokes, identical every run, spread round the circle', () => {
    const a = makeSpokes();
    expect(a).toHaveLength(360);
    expect(makeSpokes()).toEqual(a);
    // The first 18% (idle density) must cover all four quadrants.
    const quadrants = new Set(a.slice(0, 65).map((s) => Math.floor(s.angle / (Math.PI / 2))));
    expect(quadrants.size).toBe(4);
  });

  it('speech activity stays in a sane range (a rhythm, not a claimed envelope)', () => {
    for (let t = 0; t < 10; t += 0.05) {
      const v = speechActivity(t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('warp particles', () => {
  it('a burst spawns 160 streaks moving outward, all gone within a second', () => {
    const at = (s: number) => {
      const d: number[] = [];
      const alive = streaksAt(s, BURST_PARTICLES, 1, 180, 20, 1, (x1, y1) => d.push(Math.hypot(x1 - 180, y1 - 180)));
      return { alive, d };
    };
    expect(at(0).alive).toBe(160);
    // Every live streak has left the hub (radius 20) and keeps moving out.
    expect(Math.min(...at(0.3).d)).toBeGreaterThan(20);
    expect(Math.min(...at(0.3).d)).toBeGreaterThan(Math.min(...at(0.1).d));
    expect(at(1.01).alive).toBe(0);
  });

  it('never draws more than 240 particles', () => {
    const both = particleBudget(true, true);
    expect(both.burst + both.warp).toBeLessThanOrEqual(MAX_PARTICLES);
    expect(particleBudget(false, true).warp).toBe(120);
  });

  it('readouts are short status glyphs, never sentences', () => {
    expect(readoutFor('idle')).toBe('');
    expect(readoutFor('thinking').length).toBeLessThan(60);
  });
});

import { activityAfter, activityDuring, applyActivity, CORE_PRESETS as PRESETS, readoutFor as readout } from '@/lib/core/CorePresets';

describe('activity looks (spec §A)', () => {
  it('a live tool or the cloud reads as online; a phone tool as executing', () => {
    expect(activityDuring('live.weather')).toBe('online');
    expect(activityDuring('local.timer')).toBe('tool');
    expect(activityDuring(undefined, true)).toBe('online');
    expect(activityDuring(undefined, false)).toBe('none');
  });

  it('each look is visibly different from plain thinking and from error', () => {
    const base = PRESETS.thinking;
    const tool = applyActivity(base, 'tool');
    const online = applyActivity(base, 'online');
    const warning = applyActivity(base, 'warning');
    expect(online.tealOpacity).toBeGreaterThan(base.tealOpacity);
    expect(online.rings).toBeGreaterThan(base.rings);
    expect(tool.sweepSpeed).toBeGreaterThan(base.sweepSpeed);
    expect(applyActivity(base, 'success').hubGlow).toBe(1);
    expect(warning.redIntensity).toBeLessThan(base.redIntensity);
    expect(warning).not.toEqual(PRESETS.error);
    expect(applyActivity(base, 'none')).toBe(base);
    expect(readout('thinking', 'online')).toContain('ONLINE');
  });

  it('after a turn: success for a tool, warning for failure or stale data, nothing for a brain answer', () => {
    expect(activityAfter({ ok: true, viaTool: true })).toBe('success');
    expect(activityAfter({ ok: true, viaTool: true, stale: true })).toBe('warning');
    expect(activityAfter({ ok: false, viaTool: false })).toBe('warning');
    expect(activityAfter({ ok: true, viaTool: false })).toBe('none');
  });
});
