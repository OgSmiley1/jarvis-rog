import { describe, expect, it } from 'vitest';
import { BURST_MS, beamPath, coreMotion, coreShapes, dashBand, dotTrack, fanPath, glyphRing, spokePath } from '@/lib/hud/coreGeometry';
import type { HudState } from '@/lib/hud/hudState';

const STATES: HudState[] = ['OFFLINE', 'PREPARING', 'READY', 'LISTENING', 'THINKING', 'SPEAKING', 'TOOL_RUNNING', 'WATCHING', 'ERROR'];

describe('Core geometry', () => {
  it('draws each LED track as one path with one sub-path per dot', () => {
    const d = dotTrack(100, 100, 50, 12, 1);
    expect(d.match(/M/g)).toHaveLength(12);
    expect(spokePath(100, 100, 40, 50, 60).match(/L/g)).toHaveLength(60);
  });

  it('keeps the element count small and every ring inside the canvas', () => {
    const shapes = coreShapes(320);
    const paths = [shapes.glyphs, shapes.violetDots, shapes.innerDashes, shapes.rimDashes, shapes.fan, shapes.beam, ...shapes.redArcs];
    expect(paths.length + shapes.redRings.length).toBeLessThanOrEqual(20);
    for (const path of paths) {
      for (const n of path.match(/-?\d+(?:\.\d+)?/g)!.map(Number)) expect(Math.abs(n)).toBeLessThanOrEqual(320);
    }
    expect(shapes.aperture).toBeLessThan(shapes.redRings[0]!);
    expect(shapes.redRings).toEqual([...shapes.redRings].sort((a, b) => a - b));
  });

  it('is deterministic per size (safe to memoise)', () => {
    expect(coreShapes(300)).toEqual(coreShapes(300));
  });
});

describe('Core matches the reference photo', () => {
  it('draws the white rim band, the LED digits, the fan and the beam', () => {
    expect(dashBand(100, 100, 70, 98, 360).match(/M/g)).toHaveLength(360);
    // "215" = 2 (5 segments) + 1 (2) + 5 (5) = 12 closed segment polygons.
    expect(glyphRing(100, 100, 50, '215', 0, 10).match(/Z/g)).toHaveLength(12);
    expect(fanPath(100, 100, 15, 40, 38, 42).match(/M/g)).toHaveLength(42);
    expect(beamPath(100, 100, 10, 94, 1.1)).toMatch(/Z$/);
  });

  it('keeps every glyph inside its ring band', () => {
    const d = glyphRing(100, 100, 50, '8', 90, 10);
    const points = [...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((m) => Math.hypot(Number(m[1]) - 100, Number(m[2]) - 100));
    for (const r of points) expect(Math.abs(r - 50)).toBeLessThanOrEqual(7);
  });
});

describe('Core motion per state', () => {
  it('every state has a defined, bounded motion', () => {
    for (const state of STATES) {
      const m = coreMotion(state);
      expect(m.breatheScale).toBeLessThanOrEqual(0.03);
      expect(m.sweepOpacity).toBeLessThanOrEqual(1);
      expect(m.opacity).toBeGreaterThan(0);
    }
  });

  it('listening ripples teal and follows the microphone; thinking sweeps; speaking pulses', () => {
    expect(coreMotion('LISTENING')).toMatchObject({ ripple: true, teal: 1 });
    expect(coreMotion('LISTENING').levelGain).toBeGreaterThan(0);
    expect(coreMotion('THINKING').sweepMs).toBeLessThan(coreMotion('READY').sweepMs);
    expect(coreMotion('THINKING').sweepOpacity).toBeGreaterThan(coreMotion('READY').sweepOpacity);
    expect(coreMotion('SPEAKING').speakPulseMs).toBeGreaterThan(0);
    expect(coreMotion('ERROR').alarm).toBe(true);
    expect(coreMotion('OFFLINE').opacity).toBeLessThan(coreMotion('READY').opacity);
  });

  it('never flashes faster than ~2 Hz (no strobing)', () => {
    for (const state of STATES) {
      const m = coreMotion(state);
      if (m.speakPulseMs) expect(m.speakPulseMs).toBeGreaterThanOrEqual(200);
      if (m.breatheMs) expect(m.breatheMs).toBeGreaterThanOrEqual(500);
    }
    expect(BURST_MS).toBeGreaterThanOrEqual(400);
  });

  it('reduced motion and battery saver freeze it; hidden draws no frames', () => {
    for (const context of [{ reducedMotion: true }, { lowPower: true }, { hidden: true }]) {
      const m = coreMotion('THINKING', context);
      expect(m.animate).toBe(false);
      expect(m.sweepMs).toBe(0);
      // State is still readable by colour.
      expect(m.red).toBe(coreMotion('THINKING').red);
    }
  });
});
