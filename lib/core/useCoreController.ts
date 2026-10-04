import { useEffect, useRef } from 'react';
import { Easing, useDerivedValue, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import type { InteractionState } from '@/lib/voice/voiceSession';
import { CORE_PRESETS, INTERRUPT_MS, TRANSITION_MS, adjustParams, lerpParams, type CoreActivity, type CoreParams } from './CorePresets';

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
  /** Tool, online lookup, success or warning, on top of the state. */
  activity?: CoreActivity;
  /** Increments on each wake detection. */
  burst: number;
  /** Increments on each accepted interruption. */
  interrupted: number;
  /** The UI-thread clock from Skia's useClock (ms since the first frame). */
  clock: SharedValue<number>;
  /** Reads the measured loudness of what is playing now; null when unmeasurable. */
  speechLevel?: () => number | null;
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
  /** Measured voice loudness 0..1 while neural speech plays; -1 when there is none to measure. */
  speechLevel: SharedValue<number>;
}

const NEVER = -1e9;

export function useCoreController(input: CoreControllerInput): CoreController {
  const { state, speaking, offline, throttled, burst, interrupted, clock, activity = 'none', speechLevel } = input;
  const from = useSharedValue<CoreParams>(CORE_PRESETS.idle);
  const to = useSharedValue<CoreParams>(CORE_PRESETS.idle);
  const progress = useSharedValue(1);
  const speakingSV = useSharedValue(false);
  const burstAt = useSharedValue(NEVER);
  const warpAt = useSharedValue(NEVER);
  const burstSeed = useSharedValue(0);
  const warpSeed = useSharedValue(0);
  const thinking = useSharedValue(0);
  const speechLevelSV = useSharedValue(-1);
  const shownRef = useRef<InteractionState>('idle');

  const params = useDerivedValue(() => lerpParams(from.value, to.value, progress.value));

  // goTo also runs from a timer (after the interrupted warp), so it reads the
  // live activity from a ref rather than the render it was created in.
  const activityRef = useRef(activity);
  activityRef.current = activity;

  function goTo(next: InteractionState) {
    const activity = activityRef.current;
    shownRef.current = next;
    // Start from wherever the Core is right now, so a change mid-transition never jumps.
    from.value = lerpParams(from.value, to.value, progress.value);
    to.value = adjustParams(CORE_PRESETS[next], offline, throttled, next === 'interrupted' ? 'none' : activity);
    progress.value = 0;
    progress.value = withTiming(1, { duration: TRANSITION_MS, easing: Easing.out(Easing.cubic) });
    // Readouts show while thinking and while any activity look is on.
    thinking.value = withTiming(next === 'thinking' || activity !== 'none' ? 1 : 0, { duration: TRANSITION_MS });
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
    // goTo reads offline/throttled/activity; re-run when they change as well.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, offline, throttled, activity]);

  useEffect(() => {
    if (!burst) return;
    burstAt.value = clock.value;
    burstSeed.value = burst;
  }, [burst, burstAt, burstSeed, clock]);

  useEffect(() => {
    speakingSV.value = speaking;
  }, [speaking, speakingSV]);

  // While speech plays, sample the measured loudness once per frame into the
  // UI thread. Nothing runs when silent or when there is no source.
  useEffect(() => {
    if (!speaking || !speechLevel) {
      speechLevelSV.value = -1;
      return;
    }
    let frame = 0;
    const tick = () => {
      const level = speechLevel();
      speechLevelSV.value = level === null ? -1 : level;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [speaking, speechLevel, speechLevelSV]);

  return { params, speaking: speakingSV, burstAt, warpAt, burstSeed, warpSeed, thinking, speechLevel: speechLevelSV };
}
