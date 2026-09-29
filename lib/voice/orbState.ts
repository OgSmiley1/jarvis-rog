import type { LoopPhase } from './voiceLoop';

export type OrbMood = 'OFFLINE' | 'READY' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'ERROR';

/**
 * What the orb shows, from what is actually happening. Speaking wins (the
 * owner hears it), then thinking, then listening; otherwise the brain's state.
 * The old screen had no SPEAKING at all, so the orb sat on READY while JARVIS
 * talked. Pure, so the mapping is tested.
 */
export function orbMood(input: {
  speaking: boolean;
  busy: boolean;
  loopPhase?: LoopPhase;
  manualListening: boolean;
  modelStatus: 'unloaded' | 'loading' | 'ready' | 'error';
}): OrbMood {
  if (input.speaking || input.loopPhase === 'SPEAKING') return 'SPEAKING';
  if (input.busy || input.loopPhase === 'THINKING') return 'THINKING';
  if (input.manualListening || input.loopPhase === 'LISTENING' || input.loopPhase === 'FOLLOW_UP') return 'LISTENING';
  if (input.modelStatus === 'error') return 'ERROR';
  if (input.modelStatus === 'ready') return 'READY';
  return 'OFFLINE';
}
