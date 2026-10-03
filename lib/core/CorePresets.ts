import type { HudState } from '@/lib/hud/hudState';
import type { InteractionState } from '@/lib/voice/voiceSession';

/**
 * The Core's single source of truth: voice state → visual parameters.
 * Every value comes from the Core visual implementation guide, section 2,
 * which traces each one to a timestamp in the owner's reference video.
 *
 * Everything here is a plain function marked 'worklet', so it runs on the
 * UI thread inside Skia/Reanimated derived values AND in unit tests.
 */

export interface CoreParams {
  /** Dotted ring count (fractional while interpolating: the boundary ring fades). */
  rings: number;
  /** Pixels between rings, at the reference 360 px Core. Scaled to the real size. */
  ringGap: number;
  /** 0..1 of the 360 spokes visible. */
  spokeDensity: number;
  /** Radar sweep, rotations per second. */
  sweepSpeed: number;
  tealOpacity: number;
  hubGlow: number;
  /** Idle breathing amplitude, px at 360 px. */
  breathAmp: number;
  /** Seconds per breath. */
  breathPeriod: number;
  /** Master red brightness; the wake bloom pushes it to 1.6 for 400 ms. */
  redIntensity: number;
}

export type CoreState = InteractionState | 'local_inference' | 'tool_execution' | 'online_lookup' | 'success' | 'warning' | 'local_only' | 'model_loading' | 'model_downloading';
export const CORE_PRESETS: Record<CoreState, CoreParams> = {
  local_inference: { rings: 5, ringGap: 26, spokeDensity: 0.55, sweepSpeed: 0.8, tealOpacity: 0.8, hubGlow: 0.8, breathAmp: 3, breathPeriod: 1.1, redIntensity: 0.9 },
  tool_execution: { rings: 3, ringGap: 32, spokeDensity: 0.8, sweepSpeed: 0.9, tealOpacity: 1, hubGlow: 0.75, breathAmp: 2, breathPeriod: 0.8, redIntensity: 0.85 },
  online_lookup: { rings: 4, ringGap: 36, spokeDensity: 0.3, sweepSpeed: 1.5, tealOpacity: 1, hubGlow: 0.6, breathAmp: 4, breathPeriod: 1.2, redIntensity: 0.7 },
  success: { rings: 4, ringGap: 32, spokeDensity: 0.4, sweepSpeed: 0.1, tealOpacity: 1, hubGlow: 1, breathAmp: 6, breathPeriod: 1, redIntensity: 0.8 },
  warning: { rings: 2, ringGap: 38, spokeDensity: 0.2, sweepSpeed: 0.1, tealOpacity: 0.3, hubGlow: 0.5, breathAmp: 4, breathPeriod: 2, redIntensity: 0.65 },
  local_only: { rings: 3, ringGap: 34, spokeDensity: 0.2, sweepSpeed: 0.04, tealOpacity: 0.6, hubGlow: 0.4, breathAmp: 5, breathPeriod: 4, redIntensity: 0.55 },
  model_loading: { rings: 4, ringGap: 28, spokeDensity: 0.5, sweepSpeed: 0.5, tealOpacity: 0.5, hubGlow: 0.7, breathAmp: 3, breathPeriod: 1.5, redIntensity: 0.7 },
  model_downloading: { rings: 3, ringGap: 40, spokeDensity: 0.3, sweepSpeed: 0.7, tealOpacity: 0.8, hubGlow: 0.5, breathAmp: 8, breathPeriod: 2, redIntensity: 0.6 },
  idle:         { rings: 3, ringGap: 34, spokeDensity: 0.18, sweepSpeed: 0.05, tealOpacity: 0.25, hubGlow: 0.35, breathAmp: 6,  breathPeriod: 4.0, redIntensity: 0.55 },
  listening:    { rings: 4, ringGap: 30, spokeDensity: 0.35, sweepSpeed: 0.15, tealOpacity: 1.0,  hubGlow: 0.6,  breathAmp: 10, breathPeriod: 1.6, redIntensity: 0.7 },
  transcribing: { rings: 4, ringGap: 30, spokeDensity: 0.45, sweepSpeed: 0.6,  tealOpacity: 0.6,  hubGlow: 0.7,  breathAmp: 4,  breathPeriod: 1.2, redIntensity: 0.8 },
  thinking:     { rings: 5, ringGap: 28, spokeDensity: 0.6,  sweepSpeed: 1.2,  tealOpacity: 0.5,  hubGlow: 0.85, breathAmp: 3,  breathPeriod: 0.9, redIntensity: 0.95 },
  speaking:     { rings: 4, ringGap: 30, spokeDensity: 0.75, sweepSpeed: 0.3,  tealOpacity: 0.7,  hubGlow: 0.9,  breathAmp: 8,  breathPeriod: 0.5, redIntensity: 1.0 },
  interrupted:  { rings: 2, ringGap: 40, spokeDensity: 0.1,  sweepSpeed: 2.0,  tealOpacity: 0.2,  hubGlow: 0.4,  breathAmp: 2,  breathPeriod: 0.4, redIntensity: 0.6 },
  error:        { rings: 2, ringGap: 44, spokeDensity: 0.15, sweepSpeed: 0.1,  tealOpacity: 0.15, hubGlow: 0.25, breathAmp: 2,  breathPeriod: 2.5, redIntensity: 0.4 },
};

/** Guide §7: thermally throttled → fewer rings and spokes, slow sweep. Never a black screen. */
export const THERMAL_LIMITS = { rings: 2, spokeDensity: 0.2, sweepSpeed: 0.05 } as const;

/** Guide §2: offline/degraded keeps the state's params with red dimmed to 70 %. */
export const OFFLINE_RED = 0.7;

/** Guide §3: every state change eases over 350 ms. */
export const TRANSITION_MS = 350;
/** Guide §5f: the wake bloom — red to 1.6 for 400 ms. */
export const BLOOM_MS = 400;
export const BLOOM_RED = 1.6;
/** How long "interrupted" shows before the next state takes over. */
export const INTERRUPT_MS = 400;

/** Reference size the guide's pixel values were written for. */
export const REFERENCE_SIZE = 360;

/**
 * The HUD's state (what the runtime reports) → the Core's interaction state.
 * No brain yet or still loading reads as a quiet idle, not an error.
 */
export function interactionFor(hud: HudState, transcribing = false): InteractionState {
  switch (hud) {
    case 'LISTENING':
      return transcribing ? 'transcribing' : 'listening';
    case 'THINKING':
    case 'TOOL_RUNNING':
    case 'WATCHING':
      return 'thinking';
    case 'SPEAKING':
      return 'speaking';
    case 'ERROR':
      return 'error';
    default:
      return 'idle';
  }
}

export function lerpParams(from: CoreParams, to: CoreParams, t: number): CoreParams {
  'worklet';
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  // Weighted form: exact at both ends, so a finished transition equals its preset.
  const mix = (a: number, b: number) => a * (1 - k) + b * k;
  return {
    rings: mix(from.rings, to.rings),
    ringGap: mix(from.ringGap, to.ringGap),
    spokeDensity: mix(from.spokeDensity, to.spokeDensity),
    sweepSpeed: mix(from.sweepSpeed, to.sweepSpeed),
    tealOpacity: mix(from.tealOpacity, to.tealOpacity),
    hubGlow: mix(from.hubGlow, to.hubGlow),
    breathAmp: mix(from.breathAmp, to.breathAmp),
    breathPeriod: mix(from.breathPeriod, to.breathPeriod),
    redIntensity: mix(from.redIntensity, to.redIntensity),
  };
}

/** Applies the offline and thermal modifiers to a preset. */
export function adjustParams(params: CoreParams, offline: boolean, throttled: boolean): CoreParams {
  'worklet';
  let next = params;
  if (throttled) {
    next = {
      ...next,
      rings: Math.min(next.rings, THERMAL_LIMITS.rings),
      spokeDensity: Math.min(next.spokeDensity, THERMAL_LIMITS.spokeDensity),
      sweepSpeed: Math.min(next.sweepSpeed, THERMAL_LIMITS.sweepSpeed),
    };
  }
  if (offline) next = { ...next, redIntensity: next.redIntensity * OFFLINE_RED };
  return next;
}

/** Red intensity with the wake bloom applied: 1.6 at the burst, easing back over 400 ms. */
export function bloomedRed(base: number, msSinceBurst: number): number {
  'worklet';
  if (msSinceBurst < 0 || msSinceBurst > BLOOM_MS) return base;
  const k = 1 - msSinceBurst / BLOOM_MS;
  return base + (BLOOM_RED - base) * k;
}

/** Breathing offset in px at time `seconds`. */
export function breath(params: CoreParams, seconds: number, scale: number): number {
  'worklet';
  return params.breathAmp * scale * Math.sin((seconds / params.breathPeriod) * Math.PI * 2);
}

/** Opacity of ring `i` (0 = outermost) for a fractional ring count: 1 inside, fading at the edge. */
export function ringVisibility(rings: number, i: number): number {
  'worklet';
  const d = rings - i;
  return d <= 0 ? 0 : d >= 1 ? 1 : d;
}

/**
 * Illustrative speech-activity envelope — NOT real audio-reactive output.
 * The system voice exposes no amplitude, so while JARVIS is actually playing
 * speech the spokes move with this rhythm, and only then. If a TTS engine
 * ever reports a true envelope, replace this and say so.
 */
export function speechActivity(t: number): number {
  'worklet';
  return 0.5 + 0.28 * Math.sin(t * 9.1) + 0.14 * Math.sin(t * 23.7 + 1.3) + 0.08 * Math.sin(t * 41.3 + 4.1);
}

// ── Spokes ────────────────────────────────────────────────────────────────

export function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Spoke {
  angle: number;
  len: number;
  bright: boolean;
}

/**
 * 360 spokes from a seeded generator: identical every frame and every run,
 * so nothing flickers. Stored in a shuffled order so any "first n" subset is
 * spread round the whole circle rather than bunched on one side.
 */
export function makeSpokes(): Spoke[] {
  const rand = mulberry32(1337);
  const spokes = Array.from({ length: 360 }, (_, i) => ({
    angle: (i / 360) * Math.PI * 2,
    len: 0.55 + rand() * 0.45,
    bright: rand() < 0.12,
  }));
  // Bit-reversal-like spread: stride through the circle with a step coprime to 360.
  return Array.from({ length: 360 }, (_, i) => spokes[(i * 137) % 360]!);
}

export const MAX_SPOKES = 360;

// ── Warp particles ────────────────────────────────────────────────────────

/**
 * Particles are a pure function of the time since their event: no mutable
 * pool, no per-frame allocation, the same streaks every run. Each event
 * spawns `count` streaks from the hub with a seeded angle, speed and life.
 */
export const BURST_PARTICLES = 160;
export const WARP_PARTICLES = 120;
export const MAX_PARTICLES = 240;

export interface Streak {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** 1 young → 0 dead. */
  life: number;
}

/** Deterministic 0..1 for particle `i` of an event with `seed`, channel `k`. */
function unit(seed: number, i: number, k: number): number {
  'worklet';
  const x = Math.sin((seed + 1) * 12.9898 + i * 78.233 + k * 37.719) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Live streaks of one event at `seconds` after it fired. Speed 300–700 px/s
 * and life 0.6–1.0 s at the reference size (guide §5e), scaled to the Core.
 */
export function streaksAt(
  seconds: number,
  count: number,
  seed: number,
  c: number,
  hubR: number,
  scale: number,
  visit: (x1: number, y1: number, x2: number, y2: number, life: number) => void,
): number {
  'worklet';
  if (seconds < 0 || seconds > 1.0) return 0;
  let alive = 0;
  const streak = 14 * scale;
  for (let i = 0; i < count; i += 1) {
    const maxLife = 0.6 + 0.4 * unit(seed, i, 1);
    if (seconds > maxLife) continue;
    const a = unit(seed, i, 0) * Math.PI * 2;
    const v = (300 + 400 * unit(seed, i, 2)) * scale;
    const d = hubR + v * seconds;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    visit(c + d * cos, c + d * sin, c + (d + streak) * cos, c + (d + streak) * sin, 1 - seconds / maxLife);
    alive += 1;
  }
  return alive;
}

/** How many particles each live event may draw so the total never passes 240. */
export function particleBudget(burstAlive: boolean, warpAlive: boolean): { burst: number; warp: number } {
  'worklet';
  const burst = burstAlive ? BURST_PARTICLES : 0;
  const warp = warpAlive ? Math.min(WARP_PARTICLES, MAX_PARTICLES - burst) : 0;
  return { burst, warp };
}

/** Phase 2 readouts: short status glyphs on a ring — never sentences. */
export function readoutFor(state: CoreState): string {
  switch (state) {
    case 'thinking':
      return '··· PROCESSING ··· 0x2A ··· CORE 5 ··· ';
    case 'transcribing':
      return '··· DECODING ··· ';
    case 'listening':
      return '··· LISTENING ··· ';
    default:
      return '';
  }
}
