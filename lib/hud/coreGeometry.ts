import { arcPath, polar } from './orbGeometry';
import type { HudState } from './hudState';

/**
 * The Core: the LED ring from the owner's reference clips, drawn procedurally.
 *
 * Matched to the owner's reference photo: a dark hub ringed by violet dots;
 * a white fan sweeping around it; thin concentric red rings and broken arcs
 * with red seven-segment digits on them; a long red beam like a clock hand;
 * and a dense band of fine white radial light at the rim. Each track is
 * ONE SVG path (every dot is a sub-path), so the whole Core is a dozen
 * elements rather than hundreds of components, and the geometry is built once
 * per size, never per frame.
 */

const f = (n: number) => Number(n.toFixed(2));

/** One path containing `count` dots of radius `dot` evenly spaced on a circle. */
export function dotTrack(cx: number, cy: number, r: number, count: number, dot: number, phase = 0): string {
  let d = '';
  for (let i = 0; i < count; i += 1) {
    const p = polar(cx, cy, r, phase + (360 / count) * i);
    // A circle as two half-arcs: the cheapest closed dot in SVG path syntax.
    d += `M${f(p.x - dot)} ${f(p.y)}a${dot} ${dot} 0 1 0 ${f(dot * 2)} 0a${dot} ${dot} 0 1 0 ${f(-dot * 2)} 0`;
  }
  return d;
}

/** One path of `count` radial spokes between radii `inner` and `outer`. */
export function spokePath(cx: number, cy: number, inner: number, outer: number, count: number): string {
  let d = '';
  for (let i = 0; i < count; i += 1) {
    const angle = (360 / count) * i;
    const a = polar(cx, cy, inner, angle);
    const b = polar(cx, cy, outer, angle);
    d += `M${f(a.x)} ${f(a.y)}L${f(b.x)} ${f(b.y)}`;
  }
  return d;
}

/** The radar wedge: a thin pie slice from the centre, `width` degrees wide, pointing up. */
export function sweepWedge(cx: number, cy: number, r: number, width: number): string {
  const a = polar(cx, cy, r, -width);
  const b = polar(cx, cy, r, 0);
  return `M${f(cx)} ${f(cy)}L${f(a.x)} ${f(a.y)}A${f(r)} ${f(r)} 0 0 1 ${f(b.x)} ${f(b.y)}Z`;
}

/** Deterministic 0..1 noise, so the "hand-painted" texture is identical every run. */
function hash(i: number): number {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Dense white radial dashes: the fine "grass" texture of the reference's
 * outer band. Each dash starts and ends at its own radius, so the band reads
 * as light, not as a ruled ring.
 */
export function dashBand(cx: number, cy: number, inner: number, outer: number, count: number, seed = 0): string {
  let d = '';
  const span = outer - inner;
  for (let i = 0; i < count; i += 1) {
    const angle = (360 / count) * i + hash(seed + i) * 0.6;
    const r1 = inner + span * hash(seed + i * 3 + 1) * 0.45;
    const r2 = r1 + span * (0.18 + hash(seed + i * 7 + 2) * 0.5);
    const a = polar(cx, cy, r1, angle);
    const b = polar(cx, cy, Math.min(outer, r2), angle);
    d += `M${f(a.x)} ${f(a.y)}L${f(b.x)} ${f(b.y)}`;
  }
  return d;
}

/** Seven-segment LED glyphs: the red digits scattered on the reference's rings. */
const SEGMENTS: Record<string, string> = {
  '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg',
  A: 'abcefg', E: 'adefg', S: 'acdfg', H: 'bcefg', P: 'abefg', L: 'def', U: 'bcdef', t: 'defg', r: 'eg', I: 'bc',
};

/**
 * Path for a string of LED glyphs laid along a circle, each upright with its
 * top facing outward — read around the ring, as projected text is.
 */
export function glyphRing(cx: number, cy: number, r: number, text: string, startAngle: number, height: number): string {
  const w = height * 0.56;
  const t = Math.max(0.8, height * 0.14);
  const gap = w * 1.35;
  let d = '';
  [...text].forEach((ch, index) => {
    const segs = SEGMENTS[ch];
    if (!segs) return;
    const angle = startAngle + ((gap * index) / r) * (180 / Math.PI);
    const rad = (angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const centre = polar(cx, cy, r, angle);
    const rects: Record<string, [number, number, number, number]> = {
      a: [t, 0, w - 2 * t, t],
      b: [w - t, t, t, height / 2 - t],
      c: [w - t, height / 2, t, height / 2 - t],
      d: [t, height - t, w - 2 * t, t],
      e: [0, height / 2, t, height / 2 - t],
      f: [0, t, t, height / 2 - t],
      g: [t, height / 2 - t / 2, w - 2 * t, t],
    };
    for (const seg of segs) {
      const [x, y, sw, sh] = rects[seg]!;
      const corners: [number, number][] = [[x, y], [x + sw, y], [x + sw, y + sh], [x, y + sh]];
      d += corners
        .map(([px, py], k) => {
          // Local glyph space is centred, then turned so its top faces outward.
          const lx = px - w / 2;
          const ly = py - height / 2;
          const X = centre.x + lx * cos - ly * sin;
          const Y = centre.y + lx * sin + ly * cos;
          return `${k === 0 ? 'M' : 'L'}${f(X)} ${f(Y)}`;
        })
        .join('') + 'Z';
    }
  });
  return d;
}

/** The white fan near the hub: fine radial strokes across a narrow wedge, pointing up. */
export function fanPath(cx: number, cy: number, inner: number, outer: number, width: number, count: number): string {
  let d = '';
  for (let i = 0; i < count; i += 1) {
    const angle = -width + (width / (count - 1)) * i;
    const a = polar(cx, cy, inner, angle);
    const b = polar(cx, cy, outer - (outer - inner) * 0.25 * hash(i + 91), angle);
    d += `M${f(a.x)} ${f(a.y)}L${f(b.x)} ${f(b.y)}`;
  }
  return d;
}

/** The long red beam: a thin tapered blade from the hub to the rim, pointing up. */
export function beamPath(cx: number, cy: number, inner: number, outer: number, halfWidthDeg: number): string {
  const a = polar(cx, cy, inner, -halfWidthDeg * 2.2);
  const b = polar(cx, cy, outer, -halfWidthDeg);
  const c = polar(cx, cy, outer, halfWidthDeg);
  const e = polar(cx, cy, inner, halfWidthDeg * 2.2);
  return `M${f(a.x)} ${f(a.y)}L${f(b.x)} ${f(b.y)}L${f(c.x)} ${f(c.y)}L${f(e.x)} ${f(e.y)}Z`;
}

export interface CoreShapes {
  size: number;
  c: number;
  aperture: number;
  /** Solid thin red rings (radii). The first hugs the aperture and is brightest. */
  redRings: number[];
  redArcs: string[];
  glyphs: string;
  violetDots: string;
  innerDashes: string;
  rimDashes: string;
  fan: string;
  beam: string;
  /** Kept for the compact corner Core. */
  outerDots: string;
}

/** Everything static about the Core at a given size. Memoise on `size`. */
export function coreShapes(size: number): CoreShapes {
  const c = size / 2;
  const s = size;
  return {
    size,
    c,
    aperture: s * 0.06,
    redRings: [s * 0.105, s * 0.2, s * 0.285, s * 0.36, s * 0.43],
    redArcs: [
      arcPath(c, c, s * 0.155, 200, 320),
      arcPath(c, c, s * 0.155, 20, 95),
      arcPath(c, c, s * 0.245, 60, 150),
      arcPath(c, c, s * 0.245, 230, 290),
      arcPath(c, c, s * 0.325, 300, 30),
      arcPath(c, c, s * 0.325, 110, 190),
      arcPath(c, c, s * 0.395, 150, 250),
    ],
    glyphs: [
      glyphRing(c, c, s * 0.24, '215', 52, s * 0.042),
      glyphRing(c, c, s * 0.24, 'S3', 165, s * 0.042),
      glyphRing(c, c, s * 0.24, '5', 300, s * 0.042),
      glyphRing(c, c, s * 0.32, 'HEA', 245, s * 0.046),
      glyphRing(c, c, s * 0.32, '58', 118, s * 0.046),
      glyphRing(c, c, s * 0.32, '3', 20, s * 0.046),
      glyphRing(c, c, s * 0.165, '5', 185, s * 0.036),
      glyphRing(c, c, s * 0.165, 'EA', 300, s * 0.036),
      glyphRing(c, c, s * 0.395, '217', 283, s * 0.04),
      glyphRing(c, c, s * 0.395, 'S1', 70, s * 0.04),
    ].join(''),
    violetDots: dotTrack(c, c, s * 0.08, 44, Math.max(0.9, s * 0.0045)),
    innerDashes: dashBand(c, c, s * 0.21, s * 0.27, 110, 17),
    rimDashes: dashBand(c, c, s * 0.37, s * 0.495, 480, 3),
    fan: fanPath(c, c, s * 0.075, s * 0.2, 38, 42),
    beam: beamPath(c, c, s * 0.05, s * 0.47, 1.1),
    outerDots: dotTrack(c, c, s * 0.39, 128, Math.max(1, s * 0.0045), 1.4),
  };
}

/** The reference's palette: near-black, LED red, white light, a violet hub. */
export const CORE_COLORS = {
  background: '#020203',
  red: '#FF2B2B',
  redDim: '#7A0F12',
  white: '#F4F1FF',
  violet: '#8C7BFF',
  teal: '#8C7BFF',
  aperture: '#010102',
  offline: '#8A96A3',
  watching: '#B388FF',
} as const;

/** What the Core does in each state. Numbers, so they are tested, not eyeballed. */
export interface CoreMotion {
  /** Whether anything moves at all. */
  animate: boolean;
  /** Breathing period (ms, one way) and scale swing around 1. */
  breatheMs: number;
  breatheScale: number;
  /** Rotation period of the dotted tracks (ms per turn). */
  rotateMs: number;
  /** Radar sweep period (ms per turn) and its opacity. 0 opacity hides it. */
  sweepMs: number;
  sweepOpacity: number;
  /** 0..1 brightness of the violet hub / white fan accents and the red LEDs. */
  teal: number;
  red: number;
  /** Teal intake ripple while listening. */
  ripple: boolean;
  /** Speech-activity pulse period while speaking (not an audio envelope). */
  speakPulseMs: number;
  /** Microphone level adds this much scale at full level (listening only). */
  levelGain: number;
  /** Overall dim for offline / preparing. */
  opacity: number;
  /** Error: the restrained red pattern. */
  alarm: boolean;
}

export interface MotionContext {
  reducedMotion?: boolean;
  lowPower?: boolean;
  /** Screen is off or the app is in the background: no frames at all. */
  hidden?: boolean;
}

const STILL: Omit<CoreMotion, 'teal' | 'red' | 'opacity' | 'alarm'> = {
  animate: false,
  breatheMs: 0,
  breatheScale: 0,
  rotateMs: 0,
  sweepMs: 0,
  sweepOpacity: 0,
  ripple: false,
  speakPulseMs: 0,
  levelGain: 0,
};

export function coreMotion(state: HudState, context: MotionContext = {}): CoreMotion {
  const base: CoreMotion = (() => {
    switch (state) {
      case 'LISTENING':
        return { animate: true, breatheMs: 1400, breatheScale: 0.02, rotateMs: 60_000, sweepMs: 6_000, sweepOpacity: 0.35, teal: 1, red: 0.6, ripple: true, speakPulseMs: 0, levelGain: 0.1, opacity: 1, alarm: false };
      case 'THINKING':
      case 'TOOL_RUNNING':
        return { animate: true, breatheMs: 1800, breatheScale: 0.015, rotateMs: 24_000, sweepMs: 2_400, sweepOpacity: 0.9, teal: 0.55, red: 0.9, ripple: false, speakPulseMs: 0, levelGain: 0, opacity: 1, alarm: false };
      case 'SPEAKING':
        return { animate: true, breatheMs: 2200, breatheScale: 0.01, rotateMs: 40_000, sweepMs: 5_000, sweepOpacity: 0.6, teal: 0.7, red: 1, ripple: false, speakPulseMs: 260, levelGain: 0, opacity: 1, alarm: false };
      case 'WATCHING':
        return { animate: true, breatheMs: 900, breatheScale: 0.02, rotateMs: 30_000, sweepMs: 6_000, sweepOpacity: 0.35, teal: 0.9, red: 0.5, ripple: false, speakPulseMs: 0, levelGain: 0, opacity: 1, alarm: false };
      case 'ERROR':
        return { animate: true, breatheMs: 700, breatheScale: 0.012, rotateMs: 0, sweepMs: 0, sweepOpacity: 0, teal: 0.15, red: 1, ripple: false, speakPulseMs: 0, levelGain: 0, opacity: 1, alarm: true };
      case 'OFFLINE':
      case 'PREPARING':
        return { animate: true, breatheMs: 4200, breatheScale: 0.012, rotateMs: 120_000, sweepMs: 0, sweepOpacity: 0, teal: 0.25, red: 0.45, ripple: false, speakPulseMs: 0, levelGain: 0, opacity: 0.6, alarm: false };
      case 'READY':
      default:
        return { animate: true, breatheMs: 3600, breatheScale: 0.018, rotateMs: 90_000, sweepMs: 9_000, sweepOpacity: 0.5, teal: 0.45, red: 0.7, ripple: false, speakPulseMs: 0, levelGain: 0, opacity: 0.9, alarm: false };
    }
  })();
  if (context.hidden) return { ...base, ...STILL };
  // Reduced motion and battery saver: a static glow that still shows state by colour and brightness.
  if (context.reducedMotion || context.lowPower) return { ...base, ...STILL, levelGain: 0 };
  return base;
}

/** The brief contraction after an interruption, then the next state. */
export const INTERRUPT_CONTRACT_MS = 220;
/** The wake burst: a brief full-core red pulse. One flash, never a strobe. */
export const BURST_MS = 520;
