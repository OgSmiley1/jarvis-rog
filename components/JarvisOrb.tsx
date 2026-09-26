import { useEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from './theme';
import type { HudState } from '@/lib/hud/hudState';

/** Kept as an alias so existing imports of `OrbState` continue to resolve. */
export type OrbState = HudState;

const SIZE = 236;
/** Violet: no other state uses it, so a live camera is never mistaken for anything else. */
const WATCHING_TINT = '#B388FF';
const CORE = 86;

/**
 * The arc reactor.
 *
 * Three concentric rings: a slow outer ring, a faster counter-rotating inner
 * ring, and a core that breathes. The core's diameter is driven by `level`,
 * the measured microphone RMS, so when it swells it is because the room got
 * louder — not because an animation timer said so. With no reading the core
 * sits at rest.
 *
 * Built from Animated + transforms only. No SVG, no Skia, no Reanimated: this
 * ships inside the existing dependency set, and every transform it uses is
 * handled by the native driver, so it does not compete with local inference
 * for the JS thread.
 */
export function JarvisOrb({
  state,
  level = 0,
  onPress,
  label,
}: {
  state: OrbState;
  /** Measured microphone level, 0..1. See lib/voice/audioLevel.ts. */
  level?: number;
  onPress?: () => void;
  label?: string;
}) {
  const spinOuter = useRef(new Animated.Value(0)).current;
  const spinInner = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const amplitude = useRef(new Animated.Value(0)).current;
  const rippleA = useRef(new Animated.Value(0)).current;
  const rippleB = useRef(new Animated.Value(0)).current;
  const reduceMotion = useRef(false);
  const active = state === 'LISTENING' || state === 'THINKING' || state === 'SPEAKING' || state === 'TOOL_RUNNING';
  // One motion per state, so the owner can read it from across the room:
  // listening sends ripples out, speaking pulses them fast, thinking spins the
  // inner ring hard, idle only breathes.
  const ripplePeriod = state === 'SPEAKING' ? 900 : state === 'LISTENING' ? 2200 : state === 'WATCHING' ? 1400 : 0;
  const innerPeriod = state === 'THINKING' || state === 'TOOL_RUNNING' ? 1400 : active ? 4200 : 9000;

  const tint = useMemo(() => tintFor(state), [state]);

  useEffect(() => {
    let cancelled = false;
    const loops: Animated.CompositeAnimation[] = [];

    const begin = () => {
      if (cancelled || reduceMotion.current) return;
      const outer = Animated.loop(
        Animated.timing(spinOuter, { toValue: 1, duration: 14000, easing: Easing.linear, useNativeDriver: true }),
      );
      const inner = Animated.loop(
        Animated.timing(spinInner, { toValue: 1, duration: innerPeriod, easing: Easing.linear, useNativeDriver: true }),
      );
      if (ripplePeriod > 0) {
        for (const [value, delay] of [
          [rippleA, 0],
          [rippleB, ripplePeriod / 2],
        ] as const) {
          value.setValue(0);
          const ripple = Animated.loop(
            Animated.sequence([
              Animated.delay(delay),
              Animated.timing(value, { toValue: 1, duration: ripplePeriod, easing: Easing.out(Easing.quad), useNativeDriver: true }),
              Animated.timing(value, { toValue: 0, duration: 0, useNativeDriver: true }),
            ]),
          );
          loops.push(ripple);
          ripple.start();
        }
      }
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(breathe, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(breathe, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      );
      loops.push(outer, inner, pulse);
      outer.start();
      inner.start();
      pulse.start();
    };

    // Respect the owner's system setting. If the query fails we assume motion
    // is fine rather than leaving the HUD frozen with no explanation.
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        reduceMotion.current = enabled;
        begin();
      })
      .catch(() => begin());

    return () => {
      cancelled = true;
      for (const loop of loops) loop.stop();
    };
  }, [active, breathe, spinInner, spinOuter, rippleA, rippleB, ripplePeriod, innerPeriod]);

  useEffect(() => {
    const target = Math.max(0, Math.min(1, level));
    Animated.timing(amplitude, {
      toValue: target,
      duration: 90,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [amplitude, level]);

  const outerSpin = spinOuter.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const innerSpin = spinInner.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] });
  const breathScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.04] });
  // The measured level adds up to 34% on top of the resting core.
  const voiceScale = amplitude.interpolate({ inputRange: [0, 1], outputRange: [1, 1.34] });
  const haloOpacity = amplitude.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0.55] });

  const ripples = ripplePeriod > 0
    ? [rippleA, rippleB].map((value, index) => (
        <Animated.View
          key={index}
          style={[
            styles.ripple,
            {
              borderColor: tint,
              opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
              transform: [{ scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.62, 1.12] }) }],
            },
          ]}
        />
      ))
    : null;

  const body = (
    <View style={styles.stage} pointerEvents="none">
      {ripples}
      <Animated.View
        style={[styles.halo, { borderColor: tint, shadowColor: tint, opacity: active ? haloOpacity : 0.16 }]}
      />
      <Animated.View style={[styles.ringOuter, { borderColor: tint, transform: [{ rotate: outerSpin }] }]} />
      <Animated.View style={[styles.ringSegment, { borderTopColor: tint, transform: [{ rotate: outerSpin }] }]} />
      <Animated.View style={[styles.ringInner, { borderColor: tint, transform: [{ rotate: innerSpin }] }]} />
      <Animated.View
        style={[
          styles.core,
          { backgroundColor: tint, shadowColor: tint, transform: [{ scale: breathScale }, { scale: voiceScale }] },
        ]}
      />
      <View style={[styles.coreInner, { borderColor: tint }]} />
    </View>
  );

  return (
    <View style={styles.wrap}>
      {onPress ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={label ?? `JARVIS ${state}`}
          style={({ pressed }) => [styles.touch, pressed && styles.pressed]}
        >
          {body}
        </Pressable>
      ) : (
        body
      )}
      <Text style={[styles.label, { color: tint }]}>{label ?? state}</Text>
    </View>
  );
}

function tintFor(state: OrbState): string {
  switch (state) {
    case 'ERROR':
      return colors.bad;
    case 'SPEAKING':
      return colors.warn;
    case 'TOOL_RUNNING':
      return colors.good;
    case 'WATCHING':
      return WATCHING_TINT;
    case 'OFFLINE':
      return colors.muted;
    default:
      return colors.accent;
  }
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', gap: 14 },
  touch: { borderRadius: SIZE / 2 },
  pressed: { opacity: 0.75 },
  stage: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  halo: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 1,
    shadowOpacity: 0.9,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 0 },
  },
  ripple: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 2,
  },
  ringOuter: {
    position: 'absolute',
    width: SIZE - 26,
    height: SIZE - 26,
    borderRadius: (SIZE - 26) / 2,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    opacity: 0.55,
  },
  // One bright arc on the outer orbit, so rotation is readable rather than implied.
  ringSegment: {
    position: 'absolute',
    width: SIZE - 26,
    height: SIZE - 26,
    borderRadius: (SIZE - 26) / 2,
    borderWidth: 2.5,
    borderColor: 'transparent',
  },
  ringInner: {
    position: 'absolute',
    width: SIZE - 84,
    height: SIZE - 84,
    borderRadius: (SIZE - 84) / 2,
    borderWidth: 2,
    borderStyle: 'dashed',
    opacity: 0.85,
  },
  core: {
    position: 'absolute',
    width: CORE,
    height: CORE,
    borderRadius: CORE / 2,
    opacity: 0.9,
    shadowOpacity: 1,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
  },
  coreInner: {
    position: 'absolute',
    width: CORE - 34,
    height: CORE - 34,
    borderRadius: (CORE - 34) / 2,
    borderWidth: 1,
    backgroundColor: '#03080B',
    opacity: 0.85,
  },
  label: { fontWeight: '900', letterSpacing: 3, fontSize: 13 },
});
