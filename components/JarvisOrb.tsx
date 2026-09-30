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
 * Matched to the owner's reference photo: a dark hub in a violet dotted
 * ring; a white fan sweeping round it; thin red rings and broken arcs with
 * red seven-segment digits; a long red beam turning like a clock hand; a
 * dense band of fine white radial light at the rim; one red burst when the
 * wake word lands. Procedural, not a looped video.
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
  const tint = state === 'WATCHING' ? CORE_COLORS.watching : CORE_COLORS.violet;

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
  // The beam starts where the reference photo has it (lower right) and turns
  // a full turn with the rings, like a clock hand (no jump at the loop).
  const beamSpin = rotate.interpolate({ inputRange: [0, 1], outputRange: ['140deg', '500deg'] });
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

  const stroke = Math.max(0.6, size * 0.0024);
  const body = (
    <Animated.View style={{ width: size, height: size, opacity: motion.opacity, transform: [{ scale: coreScale }] }} pointerEvents="none">
      {/* Faint red haze under the light, as on the ground in the reference. */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: redGlow }]}>
        {layer(
          <>
            <Defs>
              <RadialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
                <Stop offset="0.15" stopColor={CORE_COLORS.red} stopOpacity={0} />
                <Stop offset="0.6" stopColor={CORE_COLORS.red} stopOpacity={0.16} />
                <Stop offset="1" stopColor={CORE_COLORS.red} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={c} cy={c} r={size / 2} fill="url(#coreGlow)" />
          </>,
        )}
      </Animated.View>

      {/* Outer band of fine white radial light, turning slowly. */}
      {!compact ? (
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate: spin }] }]}>
          {layer(<Path d={shapes.rimDashes} stroke={CORE_COLORS.white} strokeOpacity={0.6} strokeWidth={stroke * 0.8} />)}
        </Animated.View>
      ) : null}

      {/* Red rings, broken arcs and the LED digits: counter-rotating. */}
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate: counterSpin }] }]}>
        {layer(
          <G>
            {shapes.redRings.map((r, index) => (
              <Circle
                key={r}
                cx={c}
                cy={c}
                r={r}
                fill="none"
                stroke={CORE_COLORS.red}
                strokeOpacity={(index === 0 ? 0.95 : 0.55) * (0.5 + 0.5 * motion.red)}
                strokeWidth={index === 0 ? stroke * 2.4 : stroke * 1.2}
              />
            ))}
            <G fill="none" stroke={CORE_COLORS.red} strokeLinecap="round" strokeWidth={stroke * 2.2} strokeOpacity={0.4 + 0.55 * motion.red}>
              {shapes.redArcs.map((d, index) => (
                <Path key={index} d={d} />
              ))}
            </G>
            {!compact ? <Path d={shapes.glyphs} fill={CORE_COLORS.red} fillOpacity={0.45 + 0.5 * motion.red} /> : null}
            {!compact ? <Path d={shapes.innerDashes} stroke={CORE_COLORS.white} strokeOpacity={0.35} strokeWidth={stroke * 0.7} /> : null}
          </G>,
        )}
      </Animated.View>

      {/* The long red beam, sweeping like a clock hand. */}
      {!compact ? (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: redGlow, transform: [{ rotate: beamSpin }] }]}>
          {layer(
            <>
              <Defs>
                <RadialGradient id="beamFade" cx="50%" cy="50%" r="50%">
                  <Stop offset="0.1" stopColor={CORE_COLORS.red} stopOpacity={1} />
                  <Stop offset="1" stopColor={CORE_COLORS.red} stopOpacity={0.35} />
                </RadialGradient>
              </Defs>
              <Path d={shapes.beam} fill="url(#beamFade)" />
            </>,
          )}
        </Animated.View>
      ) : null}

      {/* The white fan around the hub: the radar sweep. */}
      {motion.sweepOpacity > 0 ? (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: motion.sweepOpacity, transform: [{ rotate: sweepSpin }] }]}>
          {layer(<Path d={shapes.fan} stroke={CORE_COLORS.white} strokeOpacity={0.9} strokeWidth={stroke * 0.9} />)}
        </Animated.View>
      ) : null}

      {/* Listening: a violet ring drawn outward from the hub. */}
      {motion.ripple ? (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: rippleOpacity, transform: [{ scale: rippleScale }] }]}>
          {layer(<Circle cx={c} cy={c} r={size * 0.3} fill="none" stroke={tint} strokeWidth={Math.max(1, size * 0.005)} />)}
        </Animated.View>
      ) : null}

      {/* Violet dotted hub ring, brighter with the voice, and the dark centre. */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: tealGlow }]}>
        {layer(<Path d={shapes.violetDots} fill={motion.alarm ? CORE_COLORS.red : tint} />)}
      </Animated.View>
      {layer(
        <>
          <Defs>
            <RadialGradient id="aperture" cx="50%" cy="50%" r="50%">
              <Stop offset="0.6" stopColor={CORE_COLORS.aperture} stopOpacity={1} />
              <Stop offset="1" stopColor={motion.alarm ? CORE_COLORS.red : tint} stopOpacity={0.4} />
            </RadialGradient>
          </Defs>
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
      {offline && !compact ? <View style={[styles.offlineDot, { top: c + shapes.aperture * 1.6, left: c - 2 }]} /> : null}
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
