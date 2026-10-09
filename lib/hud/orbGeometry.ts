/**
 * Geometry for the JARVIS reactor drawn in the reference video: arcs, the tick
 * ring and the "//" marks. Pure, so the shapes are tested, not eyeballed.
 * Angles are degrees clockwise from 12 o'clock.
 */

export function polar(cx: number, cy: number, r: number, degrees: number): { x: number; y: number } {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(radians), y: cy + r * Math.sin(radians) };
}

/** SVG path for a circular arc from `start` to `end` degrees. */
export function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
  const sweep = (((end - start) % 360) + 360) % 360 || 360;
  const a = polar(cx, cy, r, start);
  const b = polar(cx, cy, r, start + Math.min(sweep, 359.99));
  const large = sweep > 180 ? 1 : 0;
  const f = (n: number) => Number(n.toFixed(2));
  return `M ${f(a.x)} ${f(a.y)} A ${r} ${r} 0 ${large} 1 ${f(b.x)} ${f(b.y)}`;
}

/** Radial tick marks: `count` evenly spaced, every `majorEvery`-th one longer. */
export function ticks(
  cx: number,
  cy: number,
  inner: number,
  length: number,
  count: number,
  majorEvery = 4,
): Array<{ x1: number; y1: number; x2: number; y2: number; major: boolean }> {
  return Array.from({ length: count }, (_, index) => {
    const angle = (360 / count) * index;
    const major = index % majorEvery === 0;
    const a = polar(cx, cy, inner, angle);
    const b = polar(cx, cy, inner + (major ? length * 1.8 : length), angle);
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y, major };
  });
}

/** The pairs of short slashes the video places on the four diagonals ("//"). */
export function slashMarks(cx: number, cy: number, r: number, size: number): Array<{ x1: number; y1: number; x2: number; y2: number }> {
  const marks: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  const toXY = (degrees: number, length: number) => {
    const radians = ((degrees - 90) * Math.PI) / 180;
    return { x: Math.cos(radians) * length, y: Math.sin(radians) * length };
  };
  for (const angle of [45, 135, 225, 315]) {
    const center = polar(cx, cy, r, angle);
    const along = toXY(angle + 90, 1); // tangent: where the pair sits side by side
    const slant = toXY(angle + 55, size / 2); // each slash leans off the radius
    for (const side of [-0.45, 0.45]) {
      const ox = along.x * size * side;
      const oy = along.y * size * side;
      marks.push({ x1: center.x + ox - slant.x, y1: center.y + oy - slant.y, x2: center.x + ox + slant.x, y2: center.y + oy + slant.y });
    }
  }
  return marks;
}

/** Deterministic scatter of particles (seeded, so every render draws the same sky). */
export function particles(cx: number, cy: number, inner: number, outer: number, count: number, seed = 7) {
  let state = seed;
  const next = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
  return Array.from({ length: count }, () => {
    const p = polar(cx, cy, inner + next() * (outer - inner), next() * 360);
    return { x: p.x, y: p.y, r: 0.8 + next() * 1.4, opacity: 0.35 + next() * 0.6 };
  });
}
