import { describe, expect, it } from 'vitest';
import { arcPath, particles, polar, slashMarks, ticks } from '@/lib/hud/orbGeometry';

describe('reactor geometry', () => {
  it('0° is 12 o\'clock, 90° is 3 o\'clock', () => {
    const top = polar(100, 100, 50, 0);
    const right = polar(100, 100, 50, 90);
    expect(top.x).toBeCloseTo(100);
    expect(top.y).toBeCloseTo(50);
    expect(right.x).toBeCloseTo(150);
    expect(right.y).toBeCloseTo(100);
  });
  it('arcs pick the large-arc flag from the sweep', () => {
    expect(arcPath(100, 100, 50, 0, 90)).toBe('M 100 50 A 50 50 0 0 1 150 100');
    expect(arcPath(100, 100, 50, 0, 270)).toContain(' 0 1 1 ');
    expect(arcPath(100, 100, 50, 300, 30)).toContain(' 0 0 1 ');
  });
  it('tick ring has major ticks at the chosen spacing', () => {
    const ring = ticks(100, 100, 80, 4, 48, 6);
    expect(ring).toHaveLength(48);
    expect(ring.filter((tick) => tick.major)).toHaveLength(8);
  });
  it('two slashes on each diagonal', () => {
    expect(slashMarks(100, 100, 90, 8)).toHaveLength(8);
  });
  it('particles are deterministic and inside the band', () => {
    const a = particles(100, 100, 60, 90, 20);
    expect(a).toEqual(particles(100, 100, 60, 90, 20));
    for (const p of a) {
      const d = Math.hypot(p.x - 100, p.y - 100);
      expect(d).toBeGreaterThanOrEqual(59.9);
      expect(d).toBeLessThanOrEqual(90.1);
    }
  });
});
