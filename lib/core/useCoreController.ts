import { useEffect, useRef } from 'react';
import { Easing, useDerivedValue, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import type { InteractionState } from '@/lib/voice/voiceSession';
import { CORE_PRESETS, INTERRUPT_MS, TRANSITION_MS, adjustParams, lerpParams, type CoreParams } from './CorePresets';

/**
 * Voice state → animated Core parameters (guide §3).
 *
 * React only runs this when the voice *state* changes. The 350 ms ease
 * between presets, and every frame after it, is computed on the UI thread
 * from shared values — no setState per frame.
 *
 * Events: `burst` (wake word) and `interrupted` (a halt accepted) are
 * counters; each increment stamps the clock time it happened, and the
 * particle and bloom layers compute everything from "time since".
 */
export interface CoreControllerInput {
  state: InteractionState;
  /** True only while speech is actually playing (TTS onStart → onDone). */
  speaking: boolean;
  offline: boolean;
  throttled: boolean;
  /** Increments on each wake detection. */
  burst: number;
  /** Increments on each accepted interruption. */
  interrupted: number;
  /** The UI-thread clock from Skia's useClock (ms since the first frame). */
  clock: SharedValue<number>;
}

export interface CoreController {
  params: SharedValue<CoreParams>;
  speaking: SharedValue<boolean>;
  /** Clock time of the last wake burst / warp, or -1e9 if none yet. */
  burstAt: SharedValue<number>;
  warpAt: SharedValue<number>;
  burstSeed: SharedValue<number>;
  warpSeed: SharedValue<number>;
  /** 1 while thinking (for the readouts), easing like the rest. */
  thinking: SharedValue<number>;
}

const NEVER = -1e9;

export function useCoreController(input: CoreControllerInput): CoreController {
  const { state, speaking, offline, throttled, burst, interrupted, clock } = input;
  const from = useSharedValue<CoreParams>(CORE_PRESETS.idle);
  const to = useSharedValue<CoreParams>(CORE_PRESETS.idle);
  const progress = useSharedValue(1);
  const speakingSV = useSharedValue(false);
  const burstAt = useSharedValue(NEVER);
  const warpAt = useSharedValue(NEVER);
  const burstSeed = useSharedValue(0);
  const warpSeed = useSharedValue(0);
  const thinking = useSharedValue(0);
  const shownRef = useRef<InteractionState>('idle');

  const params = useDerivedValue(() => lerpParams(from.value, to.value, progress.value));

  function goTo(next: InteractionState) {
    shownRef.current = next;
    // Start from wherever the Core is right now, so a change mid-transition never jumps.
    from.value = lerpParams(from.value, to.value, progress.value);
    to.value = adjustParams(CORE_PRESETS[next], offline, throttled);
    progress.value = 0;
    progress.value = withTiming(1, { duration: TRANSITION_MS, easing: Easing.out(Easing.cubic) });
    thinking.value = withTiming(next === 'thinking' ? 1 : 0, { duration: TRANSITION_MS });
  }

  const stateRef = useRef(state);
  stateRef.current = state;

  // Interrupted is shown briefly, then the live state takes over (guide: new state within 200 ms of the warp).
  const interruptUntilRef = useRef(0);
  useEffect(() => {
    if (!interrupted) return;
    warpAt.value = clock.value;
    warpSeed.value = interrupted;
    interruptUntilRef.current = Date.now() + INTERRUPT_MS;
    goTo('interrupted');
    const timer = setTimeout(() => goTo(stateRef.current), INTERRUPT_MS);
    return () => clearTimeout(timer);
    // Only the counter triggers a warp.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interrupted]);

  useEffect(() => {
    if (Date.now() < interruptUntilRef.current) return;
    goTo(state);
    // goTo reads offline/throttled; re-run when they change as well.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, offline, throttled]);

  useEffect(() => {
    if (!burst) return;
    burstAt.value = clock.value;
    burstSeed.value = burst;
  }, [burst, burstAt, burstSeed, clock]);

  useEffect(() => {
    speakingSV.value = speaking;
  }, [speaking, speakingSV]);

  return { params, speaking: speakingSV, burstAt, warpAt, burstSeed, warpSeed, thinking };
}
