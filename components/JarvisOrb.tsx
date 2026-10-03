import { runtimeObservations } from '@/lib/diagnostics/runtime';
import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, AppState, Pressable, StyleSheet, Text, View, type AccessibilityActionEvent } from 'react-native';
import { Canvas, Circle, DashPathEffect, Group, RadialGradient, useClock, vec } from '@shopify/react-native-skia';
import type { HudState } from '@/lib/hud/hudState';
import { CORE_PRESETS, REFERENCE_SIZE, adjustParams, interactionFor, readoutFor } from '@/lib/core/CorePresets';
import { useCoreController } from '@/lib/core/useCoreController';
import { CORE_RED, CORE_TEAL, DottedRings, Hub, RadialSpokes, Readouts, Sweep, TealArcs, WarpParticles, staticRingRadii } from './core-layers';

/** Kept as an alias so existing imports of `OrbState` continue to resolve. */
export type OrbState = HudState;

/**
 * The Core — JARVIS's face. The same JarvisOrb as before, now drawn with
 * react-native-skia to the Core visual implementation guide: dotted red LED
 * rings, 360 seeded radial spokes, a radar sweep, counter-rotating teal
 * arcs, warp particles on wake and interrupt, a dark hub with a red bloom,
 * and circular readouts while thinking.
 *
 * React renders this only when the voice *state* (or a prop) changes. Every
 * frame in between is computed on the UI thread from Skia's clock and
 * Reanimated shared values; nothing calls setState per frame.
 *
 * Honest about its inputs: the spokes' "waveform" runs only while speech is
 * actually playing (`speaking`, from the TTS engine's own start/done
 * callbacks) and is a speech-activity rhythm, not an audio envelope — the
 * system voice exposes none.
 *
 * Reduced motion, battery saver, or the app in the background → a static
 * frame (hub + rings + arcs), no clock running.
 */
export function JarvisOrb({
  state,
  activity,
  level = 0,
  onPress,
  onLongPress,
  onHistory,
  label,
  size = 300,
  compact = false,
  burst = 0,
  interrupted = 0,
  offline = false,
  showLabel = false,
  speaking = false,
  transcribing = false,
  throttled = false,
}: {
  state: OrbState;
  activity?: Interaction;
  /** Measured microphone level, 0..1 (swells the hub while listening). */
  level?: number;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Accessibility action "history" — the edge gesture's equivalent. */
  onHistory?: () => void;
  label?: string;
  size?: number;
  /** The small corner Core on the camera page: no particles or readouts. */
  compact?: boolean;
  /** Increment to fire one wake burst (red bloom + 160 warp particles). */
  burst?: number;
  /** Increment on an accepted interruption (warp burst + contraction). */
  interrupted?: number;
  /** Connectivity marker: one 4 px dot, and red dimmed to 70 %. */
  offline?: boolean;
  /** Accessibility mode: a visible state label under the Core. */
  showLabel?: boolean;
  /** Speech is actually playing now (TTS onStart → onDone). Gates the waveform. */
  speaking?: boolean;
  transcribing?: boolean;
  /** Device thermally throttled: fewer rings and spokes, slow sweep. */
  throttled?: boolean;
}) {
  useEffect(() => { runtimeObservations.rendererMounted = true; return () => { runtimeObservations.rendererMounted = false; }; }, []);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [lowPower, setLowPower] = useState(false);
  const [hidden, setHidden] = useState(AppState.currentState !== 'active');

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => alive && setReducedMotion(value))
      .catch(() => undefined);
    const motionSub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    const appSub = AppState.addEventListener('change', (next) => setHidden(next !== 'active'));
    let batterySub: { remove: () => void } | undefined;
    void import('expo-battery')
      .then(async (Battery) => {
        if (!alive) return;
        const lowPowerMode = await Battery.isLowPowerModeEnabledAsync();
        if (!alive) return;
        setLowPower(lowPowerMode);
        batterySub = Battery.addLowPowerModeListener(({ lowPowerMode }) => setLowPower(lowPowerMode));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      motionSub.remove();
      appSub.remove();
      batterySub?.remove();
    };
  }, []);

  const interaction = speaking ? 'speaking' : transcribing ? 'transcribing' : activity ?? interactionFor(state, transcribing);
  const still = reducedMotion || lowPower || hidden;
  const c = size / 2;

  const canvas = still ? (
    <StaticCore size={size} interaction={interaction} offline={offline} throttled={throttled} />
  ) : (
    <LiveCore
      size={size}
      compact={compact}
      interaction={interaction}
      speaking={speaking}
      offline={offline}
      throttled={throttled}
      burst={burst}
      interrupted={interrupted}
      level={level}
    />
  );

  const body = (
    <View style={{ width: size, height: size }} pointerEvents="none">
      {canvas}
      {offline && !compact ? <View style={[styles.offlineDot, { top: c + size * 0.07, left: c - 2 }]} /> : null}
    </View>
  );

  const accessibilityActions = [
    { name: 'activate', label: 'Talk or stop' },
    ...(onLongPress ? [{ name: 'longpress', label: 'Open menu' }] : []),
    ...(onHistory ? [{ name: 'history', label: 'Open history' }] : []),
  ];
  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'activate') onPress?.();
    if (event.nativeEvent.actionName === 'longpress') onLongPress?.();
    if (event.nativeEvent.actionName === 'history') onHistory?.();
  };

  return (
    <View style={styles.wrap}>
      {onPress || onLongPress ? (
        <Pressable
          onPress={onPress}
          onLongPress={onLongPress}
          delayLongPress={450}
          accessibilityRole="button"
          accessibilityLabel={label ?? `JARVIS, ${interaction}`}
          accessibilityHint="Tap to talk or stop. Long-press for the menu."
          accessibilityActions={accessibilityActions}
          onAccessibilityAction={onAccessibilityAction}
          hitSlop={12}
          style={{ borderRadius: size / 2 }}
        >
          {body}
        </Pressable>
      ) : (
        body
      )}
      {showLabel && !compact ? <Text style={styles.label}>{label ?? interaction}</Text> : null}
    </View>
  );
}

type Interaction = import('@/lib/core/CorePresets').CoreState;

function LiveCore({
  size,
  compact,
  interaction,
  speaking,
  offline,
  throttled,
  burst,
  interrupted,
  level,
}: {
  size: number;
  compact: boolean;
  interaction: Interaction;
  speaking: boolean;
  offline: boolean;
  throttled: boolean;
  burst: number;
  interrupted: number;
  level: number;
}) {
  const clock = useClock();
  const core = useCoreController({ state: interaction, speaking, offline, throttled, burst, interrupted, clock });
  const c = size / 2;
  const layer = { c, size, core, clock };
  const readout = compact ? '' : readoutFor(interaction);
  // Microphone energy: a gentle teal swell at the hub while listening — measured, never invented.
  const hubBoost = interaction === 'listening' || interaction === 'transcribing' ? Math.min(1, level) * 0.35 : 0;

  return (
    <Canvas style={{ width: size, height: size }}>
      <Group>
        <Hub {...layer} />
        {hubBoost > 0 ? (
          <Circle cx={c} cy={c} r={size * 0.2} opacity={hubBoost}>
            <RadialGradient c={vec(c, c)} r={size * 0.2} colors={['rgba(46,230,214,0.45)', 'rgba(46,230,214,0)']} />
          </Circle>
        ) : null}
        <DottedRings {...layer} />
        <RadialSpokes {...layer} />
        <TealArcs {...layer} />
        <Sweep {...layer} />
        {!compact ? <WarpParticles {...layer} /> : null}
        {readout ? <Readouts {...layer} text={readout} /> : null}
      </Group>
    </Canvas>
  );
}

/** One still frame: hub, the state's rings and the teal arcs. No clock, no per-frame work. */
function StaticCore({ size, interaction, offline, throttled }: { size: number; interaction: Interaction; offline: boolean; throttled: boolean }) {
  const params = useMemo(() => adjustParams(CORE_PRESETS[interaction], offline, throttled), [interaction, offline, throttled]);
  const c = size / 2;
  const scale = size / REFERENCE_SIZE;
  const radii = staticRingRadii(size, params);
  return (
    <Canvas style={{ width: size, height: size }}>
      <Circle cx={c} cy={c} r={size * 0.24} opacity={params.hubGlow}>
        <RadialGradient c={vec(c, c)} r={size * 0.24} colors={['rgba(255,42,26,0.55)', 'rgba(255,42,26,0.12)', 'rgba(0,0,0,0)']} />
      </Circle>
      <Circle cx={c} cy={c} r={size * 0.055} color="#030303" />
      {radii.map((r) => (
        <Circle key={r} cx={c} cy={c} r={r} style="stroke" strokeWidth={3 * scale} strokeCap="round" color={CORE_RED} opacity={0.35 * params.redIntensity + 0.25}>
          <DashPathEffect intervals={[3 * scale, 9 * scale]} />
        </Circle>
      ))}
      <Group opacity={params.tealOpacity}>
        {[0.3, 0.36].map((f, i) => (
          <Circle key={f} cx={c} cy={c} r={size * f} style="stroke" strokeWidth={(i === 0 ? 5 : 3) * scale} color={CORE_TEAL}>
            <DashPathEffect intervals={i === 0 ? [26 * scale, 14 * scale] : [10 * scale, 22 * scale]} />
          </Circle>
        ))}
      </Group>
    </Canvas>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', gap: 10 },
  label: { color: '#E6EDF3', fontWeight: '600', letterSpacing: 1, fontSize: 14, textAlign: 'center', maxWidth: 320 },
  offlineDot: { position: 'absolute', width: 4, height: 4, borderRadius: 2, backgroundColor: '#8A96A3' },
});
