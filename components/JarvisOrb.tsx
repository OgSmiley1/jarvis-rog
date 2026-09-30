import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, Pressable, StyleSheet, Text, View, type AccessibilityActionEvent } from 'react-native';
import Svg, { Circle, Defs, G, Path, RadialGradient, Stop } from 'react-native-svg';
import type { HudState } from '@/lib/hud/hudState';
import { BURST_MS, CORE_COLORS, INTERRUPT_CONTRACT_MS, coreMotion, coreShapes } from '@/lib/hud/coreGeometry';

/** Kept as an alias so existing imports of `OrbState` continue to resolve. */
export type OrbState = HudState;

/**
 * The Core — JARVIS's face, from the owner's LED reference clips.
 *
 * Near-black; a dark central aperture; concentric red LED tracks; a ring of
 * fine red spokes; restrained teal arcs; a slow radar sweep; one red burst
 * when the wake word lands. Procedural, not a looped video.
 *
 * Every layer is a pre-built SVG path inside an Animated.View, and every
 * motion is a native-driver transform or opacity, so animation never
 * competes with the brain for the JS thread and nothing calls setState per
 * frame. Geometry is built once per size.
 *
 * Honest about what drives it: while LISTENING the glow follows the measured
 * microphone level; while SPEAKING it pulses on a fixed speech-activity
 * rhythm, because the system voice exposes no playback amplitude — it is not
 * an audio-reactive waveform and does not claim to be.
 *
 * Reduced motion or battery saver: a static glow that still shows state by
 * colour. App in the background: no animation frames.
 */
export function JarvisOrb({
  state,
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
}: {
  state: OrbState;
  /** Measured microphone level, 0..1. See lib/voice/audioLevel.ts. */
  level?: number;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Accessibility action "history" — the edge gesture's equivalent. */
  onHistory?: () => void;
  label?: string;
  size?: number;
  /** The small corner Core on the camera page: tracks only. */
  compact?: boolean;
  /** Increment to fire one wake burst. */
  burst?: number;
  /** Increment to play the brief interruption contraction. */
  interrupted?: number;
  /** Connectivity marker: one small dot, no text. */
  offline?: boolean;
  /** Accessibility mode: a visible state label under the Core. */
  showLabel?: boolean;
}) {
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
    // Battery saver: the native module is optional so a missing one never breaks the face.
    let batterySub: { remove: () => void } | undefined;
    void import('expo-battery')
      .then(async (Battery) => {
        if (!alive) return;
        setLowPower(await Battery.isLowPowerModeEnabledAsync());
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

  const motion = coreMotion(state, { reducedMotion, lowPower, hidden });
  const shapes = useMemo(() => coreShapes(size), [size]);
  const tint = state === 'WATCHING' ? CORE_COLORS.watching : CORE_COLORS.teal;

  const rotate = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const ripple = useRef(new Animated.Value(0)).current;
  const amplitude = useRef(new Animated.Value(0)).current;
  const flash = useRef(new Animated.Value(0)).current;
  const contract = useRef(new Animated.Value(0)).current;

  // One effect per motion signature: loops restart only when the state's motion changes.
  const signature = `${motion.animate}|${motion.breatheMs}|${motion.rotateMs}|${motion.sweepMs}|${motion.ripple}|${motion.speakPulseMs}`;
  useEffect(() => {
    const loops: Animated.CompositeAnimation[] = [];
    const loop = (animation: Animated.CompositeAnimation) => {
      const looped = Animated.loop(animation);
      loops.push(looped);
      looped.start();
    };
    if (motion.animate) {
      if (motion.rotateMs) {
        rotate.setValue(0);
        loop(Animated.timing(rotate, { toValue: 1, duration: motion.rotateMs, easing: Easing.linear, useNativeDriver: true }));
      }
      if (motion.sweepMs) {
        sweep.setValue(0);
        loop(Animated.timing(sweep, { toValue: 1, duration: motion.sweepMs, easing: Easing.linear, useNativeDriver: true }));
      }
      if (motion.breatheMs) {
        loop(
          Animated.sequence([
            Animated.timing(breathe, { toValue: 1, duration: motion.breatheMs, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(breathe, { toValue: 0, duration: motion.breatheMs, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          ]),
        );
      }
      if (motion.speakPulseMs) {
        loop(
          Animated.sequence([
            Animated.timing(pulse, { toValue: 1, duration: motion.speakPulseMs, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(pulse, { toValue: 0.25, duration: motion.speakPulseMs * 1.3, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          ]),
        );
      } else {
        pulse.setValue(0);
      }
      if (motion.ripple) {
        ripple.setValue(0);
        loop(Animated.timing(ripple, { toValue: 1, duration: 1600, easing: Easing.out(Easing.cubic), useNativeDriver: true }));
      } else {
        ripple.setValue(0);
      }
    } else {
      breathe.setValue(0.5);
      pulse.setValue(0);
      ripple.setValue(0);
    }
    return () => {
      for (const running of loops) running.stop();
    };
    // `signature` captures every motion field these loops read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  useEffect(() => {
    Animated.timing(amplitude, {
      toValue: motion.levelGain ? Math.max(0, Math.min(1, level)) : 0,
      duration: 90,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [amplitude, level, motion.levelGain]);

  useEffect(() => {
    if (!burst || reducedMotion) return;
    flash.setValue(0);
    Animated.sequence([
      Animated.timing(flash, { toValue: 1, duration: BURST_MS * 0.25, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(flash, { toValue: 0, duration: BURST_MS * 0.75, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [burst, flash, reducedMotion]);

  useEffect(() => {
    if (!interrupted || reducedMotion) return;
    contract.setValue(1);
    Animated.timing(contract, { toValue: 0, duration: INTERRUPT_CONTRACT_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [interrupted, contract, reducedMotion]);

  const spin = rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const counterSpin = rotate.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] });
  const sweepSpin = sweep.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const levelScale = amplitude.interpolate({ inputRange: [0, 1], outputRange: [0, motion.levelGain] });
  const coreScale = Animated.add(
    Animated.add(breathe.interpolate({ inputRange: [0, 1], outputRange: [1 - motion.breatheScale, 1 + motion.breatheScale] }), levelScale),
    Animated.add(
      pulse.interpolate({ inputRange: [0, 1], outputRange: [0, 0.018] }),
      contract.interpolate({ inputRange: [0, 1], outputRange: [0, -0.08] }),
    ),
  );
  const redGlow = Animated.add(
    breathe.interpolate({ inputRange: [0, 1], outputRange: [0.35 * motion.red, 0.6 * motion.red] }),
    pulse.interpolate({ inputRange: [0, 1], outputRange: [0, 0.35] }),
  );
  const tealGlow = Animated.add(
    breathe.interpolate({ inputRange: [0, 1], outputRange: [0.55 * motion.teal, 0.85 * motion.teal] }),
    amplitude.interpolate({ inputRange: [0, 1], outputRange: [0, 0.3] }),
  );
  const rippleScale = ripple.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1.12] });
  const rippleOpacity = ripple.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.7, 0] });

  const c = shapes.c;
  const layer = (children: React.ReactNode) => (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      {children}
    </Svg>
  );

  const body = (
    <Animated.View style={{ width: size, height: size, opacity: motion.opacity, transform: [{ scale: coreScale }] }} pointerEvents="none">
      {/* Ambient red glow behind everything. */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: redGlow }]}>
        {layer(
          <>
            <Defs>
              <RadialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
                <Stop offset="0.3" stopColor={CORE_COLORS.red} stopOpacity={0} />
                <Stop offset="0.62" stopColor={CORE_COLORS.red} stopOpacity={0.28} />
                <Stop offset="1" stopColor={CORE_COLORS.red} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={c} cy={c} r={size / 2} fill="url(#coreGlow)" />
          </>,
        )}
      </Animated.View>

      {/* Outer LED tracks, turning slowly one way… */}
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate: spin }] }]}>
        {layer(
          <G fill={CORE_COLORS.red}>
            <Path d={shapes.outerDots} fillOpacity={0.35 + 0.6 * motion.red} />
            {!compact ? <Path d={shapes.rimDots} fillOpacity={0.25 + 0.35 * motion.red} /> : null}
          </G>,
        )}
      </Animated.View>

      {/* …the middle track and the spoke ring the other way. */}
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate: counterSpin }] }]}>
        {layer(
          <G>
            <Path d={shapes.midDots} fill={CORE_COLORS.red} fillOpacity={0.3 + 0.55 * motion.red} />
            {!compact ? <Path d={shapes.spokes} stroke={CORE_COLORS.red} strokeOpacity={0.18 + 0.4 * motion.red} strokeWidth={Math.max(0.6, size * 0.0022)} /> : null}
          </G>,
        )}
      </Animated.View>

      {/* Radar sweep. */}
      {motion.sweepOpacity > 0 ? (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: motion.sweepOpacity, transform: [{ rotate: sweepSpin }] }]}>
          {layer(
            <>
              <Defs>
                <RadialGradient id="sweepFade" cx="50%" cy="50%" r="50%">
                  <Stop offset="0.25" stopColor={CORE_COLORS.red} stopOpacity={0} />
                  <Stop offset="0.95" stopColor={CORE_COLORS.red} stopOpacity={0.55} />
                </RadialGradient>
              </Defs>
              <Path d={shapes.sweep} fill="url(#sweepFade)" />
            </>,
          )}
        </Animated.View>
      ) : null}

      {/* Teal arcs: restrained, brighter while listening, following the microphone. */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: tealGlow, transform: [{ rotate: counterSpin }] }]}>
        {layer(
          <G fill="none" stroke={tint} strokeLinecap="round" strokeWidth={Math.max(1.2, size * 0.006)}>
            {shapes.tealArcs.map((d, index) => (
              <Path key={index} d={d} strokeOpacity={index % 2 ? 0.55 : 0.9} />
            ))}
          </G>,
        )}
      </Animated.View>

      {/* Listening: a teal ring drawn in from the hub outward. */}
      {motion.ripple ? (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: rippleOpacity, transform: [{ scale: rippleScale }] }]}>
          {layer(<Circle cx={c} cy={c} r={size * 0.3} fill="none" stroke={tint} strokeWidth={Math.max(1, size * 0.005)} />)}
        </Animated.View>
      ) : null}

      {/* Inner LED ring and the dark aperture with its inner glow. */}
      {layer(
        <>
          <Defs>
            <RadialGradient id="aperture" cx="50%" cy="50%" r="50%">
              <Stop offset="0.7" stopColor={CORE_COLORS.aperture} stopOpacity={1} />
              <Stop offset="1" stopColor={motion.alarm ? CORE_COLORS.red : tint} stopOpacity={0.35} />
            </RadialGradient>
          </Defs>
          <Path d={shapes.innerDots} fill={CORE_COLORS.red} fillOpacity={0.4 + 0.5 * motion.red} />
          <Circle cx={c} cy={c} r={shapes.apertureRing} fill="none" stroke={motion.alarm ? CORE_COLORS.red : tint} strokeOpacity={0.5} strokeWidth={1} />
          <Circle cx={c} cy={c} r={shapes.aperture} fill="url(#aperture)" />
        </>,
      )}

      {/* The wake burst: one full-core red pulse. */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: flash }]}>
        {layer(
          <>
            <Defs>
              <RadialGradient id="burst" cx="50%" cy="50%" r="50%">
                <Stop offset="0.2" stopColor={CORE_COLORS.red} stopOpacity={0.55} />
                <Stop offset="1" stopColor={CORE_COLORS.red} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={c} cy={c} r={size / 2} fill="url(#burst)" />
          </>,
        )}
      </Animated.View>

      {/* Offline: the single 4 px marker, over whatever state is showing. */}
      {offline && !compact ? (
        <View style={[styles.offlineDot, { top: c + shapes.aperture * 0.55, left: c - 2 }]} />
      ) : null}
    </Animated.View>
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
          accessibilityLabel={label ?? `JARVIS, ${state.toLowerCase()}`}
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
      {showLabel && !compact ? <Text style={styles.label}>{label ?? state}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', gap: 10 },
  label: { color: '#E6EDF3', fontWeight: '600', letterSpacing: 1, fontSize: 14, textAlign: 'center', maxWidth: 320 },
  offlineDot: { position: 'absolute', width: 4, height: 4, borderRadius: 2, backgroundColor: CORE_COLORS.offline },
});
