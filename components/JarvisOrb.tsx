import { useEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, Path, RadialGradient, Stop } from 'react-native-svg';
import { colors } from './theme';
import type { HudState } from '@/lib/hud/hudState';
import { arcPath, particles, slashMarks, ticks } from '@/lib/hud/orbGeometry';

/** Kept as an alias so existing imports of `OrbState` continue to resolve. */
export type OrbState = HudState;

/** The reference video's electric blue. */
const BLUE = '#3AA2FF';
const WATCHING_TINT = '#B388FF';

/**
 * The reactor from the owner's reference video: a black core with a thin
 * white ring and JARVIS set wide inside it; a thick electric-blue ring with a
 * soft glow; broken arcs orbiting at two radii; a ring of fine ticks with
 * "//" marks on the diagonals; and a scatter of particles.
 *
 * Each layer is its own SVG inside an Animated.View, so every motion is a
 * native-driver transform or opacity: nothing competes with the local brain
 * for the JS thread. The glow follows the measured microphone level, so when
 * it swells it is because the room got louder. Reduce-motion freezes it.
 *
 * Motion per state: idle breathes; listening swells with your voice; thinking
 * spins the arcs hard; speaking pulses; watching turns violet.
 */
export function JarvisOrb({
  state,
  level = 0,
  onPress,
  label,
  size = 272,
  compact = false,
}: {
  state: OrbState;
  /** Measured microphone level, 0..1. See lib/voice/audioLevel.ts. */
  level?: number;
  onPress?: () => void;
  label?: string;
  size?: number;
  /** The small corner orb on the camera page: rings only, no ticks or caption. */
  compact?: boolean;
}) {
  const spinA = useRef(new Animated.Value(0)).current;
  const spinB = useRef(new Animated.Value(0)).current;
  const spinTicks = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const amplitude = useRef(new Animated.Value(0)).current;
  const twinkle = useRef(new Animated.Value(0)).current;

  const tint = tintFor(state);
  const busy = state === 'THINKING' || state === 'TOOL_RUNNING';
  const arcPeriod = busy ? 1600 : state === 'LISTENING' || state === 'SPEAKING' ? 7000 : 14000;
  const pulsePeriod = state === 'SPEAKING' ? 450 : state === 'WATCHING' ? 700 : 1800;

  useEffect(() => {
    let cancelled = false;
    const loops: Animated.CompositeAnimation[] = [];
    const loop = (animation: Animated.CompositeAnimation) => {
      const looped = Animated.loop(animation);
      loops.push(looped);
      looped.start();
    };
    const begin = (reduce: boolean) => {
      if (cancelled || reduce) return;
      spinA.setValue(0);
      spinB.setValue(0);
      loop(Animated.timing(spinA, { toValue: 1, duration: arcPeriod, easing: Easing.linear, useNativeDriver: true }));
      loop(Animated.timing(spinB, { toValue: 1, duration: arcPeriod * 1.6, easing: Easing.linear, useNativeDriver: true }));
      loop(Animated.timing(spinTicks, { toValue: 1, duration: 60000, easing: Easing.linear, useNativeDriver: true }));
      loop(
        Animated.sequence([
          Animated.timing(breathe, { toValue: 1, duration: pulsePeriod, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(breathe, { toValue: 0, duration: pulsePeriod, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      );
      loop(
        Animated.sequence([
          Animated.timing(twinkle, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(twinkle, { toValue: 0, duration: 2600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      );
    };
    AccessibilityInfo.isReduceMotionEnabled()
      .then(begin)
      .catch(() => begin(false));
    return () => {
      cancelled = true;
      for (const running of loops) running.stop();
    };
  }, [arcPeriod, pulsePeriod, spinA, spinB, spinTicks, breathe, twinkle]);

  useEffect(() => {
    Animated.timing(amplitude, {
      toValue: Math.max(0, Math.min(1, level)),
      duration: 90,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [amplitude, level]);

  const c = size / 2;
  const R = {
    core: size * 0.215,
    whiteRing: size * 0.222,
    blueRing: size * 0.262,
    arcA: size * 0.305,
    arcB: size * 0.335,
    tick: size * 0.395,
    slash: size * 0.45,
  };

  const shapes = useMemo(
    () => ({
      ticks: ticks(c, c, R.tick, size * 0.012, 60, 5),
      slashes: slashMarks(c, c, R.slash, size * 0.035),
      dots: particles(c, c, size * 0.3, size * 0.49, 26),
    }),
    // Geometry depends only on the size.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [size],
  );

  const rotateA = spinA.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const rotateB = spinB.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] });
  const rotateTicks = spinTicks.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const glowOpacity = Animated.add(
    breathe.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0.85] }),
    amplitude.interpolate({ inputRange: [0, 1], outputRange: [0, 0.35] }),
  );
  const glowScale = Animated.add(
    breathe.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1.03] }),
    amplitude.interpolate({ inputRange: [0, 1], outputRange: [0, 0.12] }),
  );
  const dotsOpacity = twinkle.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] });
  const dim = state === 'OFFLINE' ? 0.45 : 1;

  const layer = (children: React.ReactNode) => (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      {children}
    </Svg>
  );

  const body = (
    <View style={{ width: size, height: size, opacity: dim }} pointerEvents="none">
      {/* Glow halo and the thick blue ring: breathe, and swell with the voice. */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]}>
        {layer(
          <>
            <Defs>
              <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
                <Stop offset="0.42" stopColor={tint} stopOpacity={0} />
                <Stop offset="0.52" stopColor={tint} stopOpacity={0.55} />
                <Stop offset="0.6" stopColor={tint} stopOpacity={0.22} />
                <Stop offset="0.8" stopColor={tint} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={c} cy={c} r={size / 2} fill="url(#halo)" />
            <Circle cx={c} cy={c} r={R.blueRing} fill="none" stroke={tint} strokeWidth={size * 0.028} />
            <Circle cx={c} cy={c} r={R.blueRing} fill="none" stroke="#DDF1FF" strokeOpacity={0.55} strokeWidth={1.2} />
          </>,
        )}
      </Animated.View>

      {/* Outer broken arcs, clockwise. */}
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate: rotateA }] }]}>
        {layer(
          <G fill="none" strokeLinecap="round">
            <Path d={arcPath(c, c, R.arcA, 200, 262)} stroke="#FFFFFF" strokeOpacity={0.9} strokeWidth={2.6} />
            <Path d={arcPath(c, c, R.arcA, 20, 58)} stroke={tint} strokeOpacity={0.9} strokeWidth={2} />
            {!compact ? <Path d={arcPath(c, c, R.arcA, 300, 312)} stroke="#FFFFFF" strokeOpacity={0.7} strokeWidth={2} /> : null}
          </G>,
        )}
      </Animated.View>

      {/* Inner broken arcs, counter-clockwise. */}
      <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate: rotateB }] }]}>
        {layer(
          <G fill="none" strokeLinecap="round">
            <Path d={arcPath(c, c, R.arcB, 110, 168)} stroke="#FFFFFF" strokeOpacity={0.75} strokeWidth={1.6} />
            <Path d={arcPath(c, c, R.arcB, 250, 275)} stroke={tint} strokeOpacity={0.8} strokeWidth={1.6} />
          </G>,
        )}
      </Animated.View>

      {/* Tick ring, "//" marks and particles: slow drift. */}
      {!compact ? (
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ rotate: rotateTicks }] }]}>
          {layer(
            <G>
              {shapes.ticks.map((tick, index) => (
                <Line
                  key={`t${index}`}
                  x1={tick.x1}
                  y1={tick.y1}
                  x2={tick.x2}
                  y2={tick.y2}
                  stroke="#FFFFFF"
                  strokeOpacity={tick.major ? 0.75 : 0.28}
                  strokeWidth={tick.major ? 1.4 : 1}
                />
              ))}
              {shapes.slashes.map((mark, index) => (
                <Line key={`s${index}`} x1={mark.x1} y1={mark.y1} x2={mark.x2} y2={mark.y2} stroke="#FFFFFF" strokeOpacity={0.8} strokeWidth={1.6} />
              ))}
            </G>,
          )}
        </Animated.View>
      ) : null}
      {!compact ? (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: dotsOpacity }]}>
          {layer(
            <G>
              {shapes.dots.map((dot, index) => (
                <Circle key={index} cx={dot.x} cy={dot.y} r={dot.r} fill="#FFFFFF" fillOpacity={dot.opacity} />
              ))}
            </G>,
          )}
        </Animated.View>
      ) : null}

      {/* The core: black, a thin white ring, JARVIS set wide. */}
      {layer(
        <>
          <Circle cx={c} cy={c} r={R.core} fill="#06080D" />
          <Circle cx={c} cy={c} r={R.whiteRing} fill="none" stroke="#FFFFFF" strokeOpacity={0.92} strokeWidth={1.4} />
        </>,
      )}
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <Text style={[styles.word, { fontSize: Math.max(8, size * 0.052), letterSpacing: size * 0.02 }]}>JARVIS</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.wrap}>
      {onPress ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={label ?? `JARVIS ${state}`}
          style={({ pressed }) => [{ borderRadius: size / 2 }, pressed && styles.pressed]}
        >
          {body}
        </Pressable>
      ) : (
        body
      )}
      {!compact ? <Text style={[styles.label, { color: tint }]}>{label ?? state}</Text> : null}
    </View>
  );
}

function tintFor(state: OrbState): string {
  switch (state) {
    case 'ERROR':
      return colors.bad;
    case 'WATCHING':
      return WATCHING_TINT;
    case 'OFFLINE':
      return '#5D7288';
    default:
      return BLUE;
  }
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', gap: 6 },
  pressed: { opacity: 0.8 },
  center: { alignItems: 'center', justifyContent: 'center' },
  word: { color: '#FFFFFF', fontWeight: '300' },
  label: { fontWeight: '700', letterSpacing: 4, fontSize: 11, opacity: 0.85 },
});
