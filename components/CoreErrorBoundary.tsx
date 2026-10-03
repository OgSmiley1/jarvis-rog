import { Component, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { HudState } from '@/lib/hud/hudState';
import { FALLBACK_LOOKS, coreErrorState } from '@/lib/core/fallbackCore';
import { recordLive } from '@/lib/telemetry/liveLog';

/**
 * The Core must never take JARVIS down. If the Skia/Reanimated canvas throws
 * while rendering (a native drawing failure on an untested device), this
 * catches it, logs it to the live link, and draws a plain-View Core in its
 * place — same size, same state colours. Taps and long-presses keep working
 * because the Pressable lives outside this boundary.
 */
export class CoreErrorBoundary extends Component<
  { size: number; state: HudState; children: ReactNode },
  { failed: boolean; reason?: string }
> {
  state = { failed: false as boolean, reason: undefined as string | undefined };

  static getDerivedStateFromError(error: unknown) {
    return coreErrorState(error);
  }

  componentDidCatch(error: unknown) {
    recordLive('error', 'core render failed — using the plain Core', { reason: coreErrorState(error).reason });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <FallbackCore size={this.props.size} state={this.props.state} />;
  }
}

export function FallbackCore({ size, state }: { size: number; state: HudState }) {
  const look = FALLBACK_LOOKS[state];
  const ring = (fraction: number, color: string, width: number, dashed = false) => ({
    position: 'absolute' as const,
    width: size * fraction,
    height: size * fraction,
    borderRadius: (size * fraction) / 2,
    borderWidth: width,
    borderColor: color,
    borderStyle: dashed ? ('dotted' as const) : ('solid' as const),
    opacity: look.glow,
  });
  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <View style={ring(0.88, look.ring, 3, true)} />
      <View style={ring(0.7, look.ring, 2, true)} />
      <View style={ring(0.6, look.accent, 3)} />
      <View style={ring(0.22, look.ring, 3)} />
      <View style={[styles.hub, { width: size * 0.11, height: size * 0.11, borderRadius: size * 0.055 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  hub: { backgroundColor: '#030303' },
});
