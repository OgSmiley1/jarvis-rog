import { useMemo } from 'react';
import { Circle, DashPathEffect, Group, Path, RadialGradient, Skia, TextPath, matchFont, usePathValue, vec, type SkPath } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import {
  BURST_PARTICLES,
  REFERENCE_SIZE,
  WARP_PARTICLES,
  bloomedRed,
  breath,
  makeSpokes,
  particleBudget,
  ringVisibility,
  speechActivity,
  streaksAt,
  type CoreParams,
} from '@/lib/core/CorePresets';
import type { CoreController } from '@/lib/core/useCoreController';

/**
 * The Core's layers (guide §5), each a small Skia component. They read
 * shared values only; every per-frame number is computed on the UI thread.
 *
 * API names verified against @shopify/react-native-skia 2.2.12: the guide's
 * `useClockValue`/`useComputedValue` are the 1.x API and no longer exist —
 * the clock is `useClock()` (a Reanimated shared value) and derived numbers
 * are Reanimated `useDerivedValue`; per-frame paths use `usePathValue`,
 * which resets and refills ONE path (no per-frame allocation). Rotations in
 * Skia transforms are radians, so the guide's degrees are converted.
 */

export const CORE_RED = '#ff2a1a';
export const CORE_TEAL = '#2ee6d6';

export interface LayerProps {
  c: number;
  size: number;
  core: CoreController;
  clock: SharedValue<number>;
}

const redNow = (core: CoreController, clock: SharedValue<number>) => {
  'worklet';
  return bloomedRed(core.params.value.redIntensity, clock.value - core.burstAt.value);
};

// ── 5f. Hub + bloom ─────────────────────────────────────────────────────

export function Hub({ c, size, core, clock }: LayerProps) {
  const hubR = size * 0.1;
  const glow = useDerivedValue(() => Math.min(1, core.params.value.hubGlow * (redNow(core, clock) / Math.max(0.4, core.params.value.redIntensity))));
  return (
    <Group>
      <Circle cx={c} cy={c} r={hubR * 2.4} opacity={glow}>
        <RadialGradient c={vec(c, c)} r={hubR * 2.4} colors={['rgba(255,42,26,0.55)', 'rgba(255,42,26,0.12)', 'rgba(0,0,0,0)']} />
      </Circle>
      <Circle cx={c} cy={c} r={hubR * 0.55} color="#030303" />
    </Group>
  );
}

// ── 5a. Dotted rings ────────────────────────────────────────────────────

function Ring({ i, c, size, core, clock }: LayerProps & { i: number }) {
  const scale = size / REFERENCE_SIZE;
  const maxR = size * 0.44;
  const r = useDerivedValue(() => {
    const p = core.params.value;
    return Math.max(4, maxR - i * p.ringGap * scale + breath(p, clock.value / 1000, scale));
  });
  const opacity = useDerivedValue(() => {
    const p = core.params.value;
    const vis = ringVisibility(p.rings, i);
    return vis * 0.35 * Math.min(1.6, redNow(core, clock)) + 0.25 * vis;
  });
  return (
    <Circle cx={c} cy={c} r={r} opacity={opacity} style="stroke" strokeWidth={3 * scale} strokeCap="round" color={CORE_RED}>
      <DashPathEffect intervals={[3 * scale, 9 * scale]} />
    </Circle>
  );
}

export function DottedRings(props: LayerProps) {
  return (
    <Group>
      {[0, 1, 2, 3, 4].map((i) => (
        <Ring key={i} i={i} {...props} />
      ))}
    </Group>
  );
}

// ── 5b. Radial spokes ───────────────────────────────────────────────────

export function RadialSpokes({ c, size, core, clock }: LayerProps) {
  const spokes = useMemo(makeSpokes, []);
  const angles = useMemo(() => spokes.map((s) => s.angle), [spokes]);
  const lens = useMemo(() => spokes.map((s) => s.len), [spokes]);
  const rBase = size * 0.16;
  const rMax = size * 0.42;
  const path = usePathValue((p) => {
    'worklet';
    const params = core.params.value;
    const t = clock.value / 1000;
    const n = Math.floor(360 * params.spokeDensity);
    // Gated by real playback: the rhythm runs only while speech is actually playing.
    const mod = core.speaking.value ? speechActivity(t) : 0;
    for (let i = 0; i < n; i += 1) {
      const a = angles[i]!;
      const wobble = 1 + 0.22 * mod * Math.sin(a * 3 + t * 7);
      const r2 = rBase + (rMax - rBase) * lens[i]! * wobble;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      p.moveTo(c + rBase * cos, c + rBase * sin);
      p.lineTo(c + r2 * cos, c + r2 * sin);
    }
  });
  const opacity = useDerivedValue(() => 0.25 + 0.55 * Math.min(1, redNow(core, clock)));
  return <Path path={path} opacity={opacity} color={CORE_RED} style="stroke" strokeWidth={1.5 * (size / REFERENCE_SIZE)} />;
}

// ── 5c. Radar sweep ─────────────────────────────────────────────────────

export function Sweep({ c, size, core, clock }: LayerProps) {
  const r = size * 0.44;
  const wedge = useMemo(() => {
    const p = Skia.Path.Make();
    p.moveTo(c, c);
    p.lineTo(c + r, c);
    // Guide's `arcTo` → Skia 2.2's `arcToOval(rect, startDeg, sweepDeg, forceMoveTo)`.
    p.arcToOval(Skia.XYWHRect(c - r, c - r, r * 2, r * 2), 0, -24, false);
    p.close();
    return p;
  }, [c, r]);
  const edge = useMemo(() => {
    const p = Skia.Path.Make();
    p.moveTo(c, c);
    p.lineTo(c + r, c);
    return p;
  }, [c, r]);
  // Integrate speed over time so a speed change never makes the sweep jump.
  const transform = useDerivedValue(() => {
    const turns = (clock.value / 1000) * core.params.value.sweepSpeed;
    return [{ rotate: (turns % 1) * Math.PI * 2 }];
  });
  const opacity = useDerivedValue(() => 0.1 + 0.25 * Math.min(1.6, redNow(core, clock)));
  return (
    <Group origin={vec(c, c)} transform={transform}>
      <Path path={wedge} color="#ff3b2a" opacity={opacity} />
      <Path path={edge} color="#ffd9d2" style="stroke" strokeWidth={2 * (size / REFERENCE_SIZE)} opacity={0.8} />
    </Group>
  );
}

// ── 5d. Teal arcs ───────────────────────────────────────────────────────

export function TealArcs({ c, size, core, clock }: LayerProps) {
  const scale = size / REFERENCE_SIZE;
  const transform = useDerivedValue(() => [{ rotate: -(((clock.value / 1000) * 12) % 360) * (Math.PI / 180) }]);
  const opacity = useDerivedValue(() => core.params.value.tealOpacity);
  return (
    <Group origin={vec(c, c)} transform={transform} opacity={opacity}>
      {[0.3, 0.36].map((f, i) => (
        <Circle key={f} cx={c} cy={c} r={size * f} style="stroke" strokeWidth={(i === 0 ? 5 : 3) * scale} color={CORE_TEAL}>
          <DashPathEffect intervals={i === 0 ? [26 * scale, 14 * scale] : [10 * scale, 22 * scale]} />
        </Circle>
      ))}
    </Group>
  );
}

// ── 5e. Warp particles ──────────────────────────────────────────────────

export function WarpParticles({ c, size, core, clock }: LayerProps) {
  const scale = size / REFERENCE_SIZE;
  const hubR = size * 0.1;
  // Two passes for the video's white-hot / red-fading mix: young streaks
  // (life > 0.5) are drawn white, older ones red. Same seeded streaks in both.
  const draw = (p: SkPath, young: boolean) => {
    'worklet';
    const bs = (clock.value - core.burstAt.value) / 1000;
    const ws = (clock.value - core.warpAt.value) / 1000;
    const budget = particleBudget(bs >= 0 && bs <= 1, ws >= 0 && ws <= 1);
    const add = (x1: number, y1: number, x2: number, y2: number, life: number) => {
      'worklet';
      if (life > 0.5 === young) {
        p.moveTo(x1, y1);
        p.lineTo(x2, y2);
      }
    };
    if (budget.burst) streaksAt(bs, Math.min(budget.burst, BURST_PARTICLES), core.burstSeed.value, c, hubR, scale, add);
    if (budget.warp) streaksAt(ws, Math.min(budget.warp, WARP_PARTICLES), core.warpSeed.value + 1000, c, hubR, scale, add);
  };
  const white = usePathValue((p) => {
    'worklet';
    draw(p, true);
  });
  const red = usePathValue((p) => {
    'worklet';
    draw(p, false);
  });
  return (
    <Group>
      <Path path={red} color={CORE_RED} style="stroke" strokeWidth={2 * scale} opacity={0.6} />
      <Path path={white} color="#ffffff" style="stroke" strokeWidth={2 * scale} opacity={0.85} />
    </Group>
  );
}

// ── 5g. Circular dot-matrix readouts (phase 2, thinking only) ───────────

export function Readouts({ c, size, core, text }: LayerProps & { text: string }) {
  const r = size * 0.335;
  const font = useMemo(() => {
    try {
      return matchFont({ fontFamily: 'monospace', fontSize: Math.max(8, size * 0.028), fontWeight: 'bold' });
    } catch {
      return null;
    }
  }, [size]);
  const circle = useMemo(() => {
    const p = Skia.Path.Make();
    p.addCircle(c, c, r);
    return p;
  }, [c, r]);
  if (!font || !text) return null;
  return (
    <Group opacity={core.thinking}>
      <TextPath path={circle} font={font} text={text.repeat(3)} color={CORE_RED} />
    </Group>
  );
}

// ── Static frame (reduced motion / battery saver / background) ──────────

export function staticRingRadii(size: number, params: CoreParams): number[] {
  const scale = size / REFERENCE_SIZE;
  return Array.from({ length: Math.round(params.rings) }, (_, i) => size * 0.44 - i * params.ringGap * scale);
}
