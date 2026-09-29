import type { LoopEvent, LoopPhase } from '@/lib/voice/voiceLoop';

/** Web: no microphone loop. */
export function useHandsFree(_options: unknown) {
  return {
    running: false,
    phase: 'IDLE' as LoopPhase,
    wakeEngine: 'none' as 'openWakeWord' | 'spoken' | 'none',
    level: 0,
    error: 'Hands-free needs the Android app.' as string | null,
    start: async () => {},
    stop: () => {},
    report: (_event: Extract<LoopEvent, { type: 'REPLY_STARTED' | 'SPOKEN' | 'REPLY_DONE' }>) => {},
  };
}
