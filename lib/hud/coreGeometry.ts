import { arcPath, polar } from './orbGeometry';
import type { HudState } from './hudState';

/**
 * The Core: the LED ring from the owner's reference clips, drawn procedurally.
 *
 * A dark central aperture; concentric tracks of red LED dots; a ring of fine
 * red radial spokes; restrained teal arcs; a slow radar sweep. Each track is
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

export interface CoreShapes {
  size: number;
  c: number;
  aperture: number;
  apertureRing: number;
  innerDots: string;
  tealArcs: string[];
  spokes: string;
  midDots: string;
  outerDots: string;
  rimDots: string;
  sweep: string;
  sweepRadius: number;
}

/** Everything static about the Core at a given size. Memoise on `size`. */
export function coreShapes(size: number): CoreShapes {
  const c = size / 2;
  const s = size;
  return {
    size,
    c,
    aperture: s * 0.15,
    apertureRing: s * 0.165,
    innerDots: dotTrack(c, c, s * 0.2, 48, Math.max(0.8, s * 0.0035)),
    tealArcs: [
      arcPath(c, c, s * 0.235, 20, 110),
      arcPath(c, c, s * 0.235, 160, 205),
      arcPath(c, c, s * 0.235, 250, 330),
      arcPath(c, c, s * 0.255, 300, 20),
      arcPath(c, c, s * 0.255, 120, 170),
    ],
    spokes: spokePath(c, c, s * 0.275, s * 0.325, 120),
    midDots: dotTrack(c, c, s * 0.345, 96, Math.max(0.9, s * 0.004)),
    outerDots: dotTrack(c, c, s * 0.39, 128, Math.max(1, s * 0.0045), 1.4),
    rimDots: dotTrack(c, c, s * 0.44, 72, Math.max(0.8, s * 0.003)),
    sweep: sweepWedge(c, c, s * 0.46, 38),
    sweepRadius: s * 0.46,
  };
}

/** Near-black background, LED red, restrained teal — the reference palette. */
export const CORE_COLORS = {
  background: '#030406',
  red: '#FF2A3D',
  redDim: '#7A0F1A',
  teal: '#27E3D0',
  aperture: '#020203',
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
  /** 0..1 brightness of the teal arcs and the red LEDs. */
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
        return { animate: true, breatheMs: 1400, breatheScale: 0.02, rotateMs: 60_000, sweepMs: 0, sweepOpacity: 0, teal: 1, red: 0.6, ripple: true, speakPulseMs: 0, levelGain: 0.1, opacity: 1, alarm: false };
      case 'THINKING':
      case 'TOOL_RUNNING':
        return { animate: true, breatheMs: 1800, breatheScale: 0.015, rotateMs: 24_000, sweepMs: 2_400, sweepOpacity: 0.55, teal: 0.55, red: 0.9, ripple: false, speakPulseMs: 0, levelGain: 0, opacity: 1, alarm: false };
      case 'SPEAKING':
        return { animate: true, breatheMs: 2200, breatheScale: 0.01, rotateMs: 40_000, sweepMs: 0, sweepOpacity: 0, teal: 0.7, red: 1, ripple: false, speakPulseMs: 260, levelGain: 0, opacity: 1, alarm: false };
      case 'WATCHING':
        return { animate: true, breatheMs: 900, breatheScale: 0.02, rotateMs: 30_000, sweepMs: 6_000, sweepOpacity: 0.35, teal: 0.9, red: 0.5, ripple: false, speakPulseMs: 0, levelGain: 0, opacity: 1, alarm: false };
      case 'ERROR':
        return { animate: true, breatheMs: 700, breatheScale: 0.012, rotateMs: 0, sweepMs: 0, sweepOpacity: 0, teal: 0.15, red: 1, ripple: false, speakPulseMs: 0, levelGain: 0, opacity: 1, alarm: true };
      case 'OFFLINE':
      case 'PREPARING':
        return { animate: true, breatheMs: 4200, breatheScale: 0.012, rotateMs: 120_000, sweepMs: 0, sweepOpacity: 0, teal: 0.25, red: 0.45, ripple: false, speakPulseMs: 0, levelGain: 0, opacity: 0.6, alarm: false };
      case 'READY':
      default:
        return { animate: true, breatheMs: 3600, breatheScale: 0.018, rotateMs: 90_000, sweepMs: 14_000, sweepOpacity: 0.12, teal: 0.45, red: 0.7, ripple: false, speakPulseMs: 0, levelGain: 0, opacity: 0.9, alarm: false };
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
