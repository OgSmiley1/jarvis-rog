/**
 * The hands-free loop, as a pure state machine:
 *
 *   IDLE ──wake──► LISTENING ──utterance──► THINKING ──first sound──► SPEAKING
 *     ▲                                                                   │
 *     └──── timeout ──── FOLLOW_UP (8 s: talk again without the wake word) ◄┘
 *
 * The screen feeds it events (a wake word, a transcribed utterance, the voice
 * starting and ending, time passing) and does what the returned actions say.
 * No timers, no audio, no React — so every rule below is unit-tested.
 *
 * Barge-in: while JARVIS thinks or speaks, an utterance interrupts it only if
 * it has at least two words and is not an echo of what JARVIS is saying — a
 * cough or its own voice through the speaker never cancels an answer. A halt
 * word ("stop", «اسكت») is the exception: one word is enough.
 */

export type LoopPhase = 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'FOLLOW_UP';

export interface LoopState {
  phase: LoopPhase;
  /** LISTENING / FOLLOW_UP end at this time (ms). */
  until?: number;
  /** What JARVIS is saying now, to recognise its own voice coming back in. */
  speaking?: string;
}

export type LoopEvent =
  | { type: 'WAKE'; at: number }
  | { type: 'UTTERANCE'; text: string; at: number }
  | { type: 'REPLY_STARTED'; at: number }
  | { type: 'SPOKEN'; text: string }
  | { type: 'REPLY_DONE'; at: number }
  | { type: 'TICK'; at: number }
  | { type: 'STOP' };

export type LoopAction = { type: 'SEND'; command: string } | { type: 'INTERRUPT' } | { type: 'IGNORED'; reason: string };

export const LISTEN_MS = 8_000;
export const FOLLOW_UP_MS = 8_000;

export const IDLE_STATE: LoopState = { phase: 'IDLE' };

const WAKE_PHRASE = /^\s*(?:(?:hey|ok|okay|hi)[\s,]+)?(?:jarvis|jervis|javis|jarvi|جارفيس|جارفس|جارفز|يا\s+جارفيس)[\s,.:;!?،؟-]*/iu;
const HALT = /^(?:stop|stop it|stop talking|be quiet|quiet|shut up|enough|cancel|jarvis stop|اسكت|وقف|قف|خلاص|بس)[.!?،؟\s]*$/iu;

/** The command after the wake phrase, or null when the words do not start with it. */
export function afterWakePhrase(text: string): string | null {
  const match = WAKE_PHRASE.exec(text);
  if (!match) return null;
  return text.slice(match[0].length).trim();
}

export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function isHalt(text: string): boolean {
  return HALT.test(text.trim().toLowerCase());
}

/**
 * True when most of what was heard is words JARVIS is saying right now: its
 * own voice picked up by the microphone, not the owner.
 */
export function isEcho(heard: string, speaking: string | undefined): boolean {
  if (!speaking) return false;
  const heardWords = words(heard);
  if (heardWords.length === 0) return true;
  const spoken = new Set(words(speaking));
  const shared = heardWords.filter((word) => spoken.has(word)).length;
  return shared / heardWords.length >= 0.6;
}

export function step(state: LoopState, event: LoopEvent): { state: LoopState; actions: LoopAction[] } {
  const same = (reason: string) => ({ state, actions: [{ type: 'IGNORED', reason } as LoopAction] });

  switch (event.type) {
    case 'STOP':
      return { state: IDLE_STATE, actions: [{ type: 'INTERRUPT' }] };

    case 'TICK':
      if ((state.phase === 'LISTENING' || state.phase === 'FOLLOW_UP') && state.until !== undefined && event.at >= state.until) {
        return { state: IDLE_STATE, actions: [] };
      }
      return { state, actions: [] };

    case 'WAKE':
      if (state.phase === 'THINKING' || state.phase === 'SPEAKING') {
        // Saying the wake word over JARVIS is the clearest interruption there is.
        return { state: { phase: 'LISTENING', until: event.at + LISTEN_MS }, actions: [{ type: 'INTERRUPT' }] };
      }
      return { state: { phase: 'LISTENING', until: event.at + LISTEN_MS }, actions: [] };

    case 'REPLY_STARTED':
      return state.phase === 'THINKING' ? { state: { ...state, phase: 'SPEAKING' }, actions: [] } : { state, actions: [] };

    case 'SPOKEN':
      return { state: { ...state, speaking: `${state.speaking ?? ''} ${event.text}`.trim().slice(-600) }, actions: [] };

    case 'REPLY_DONE':
      if (state.phase !== 'THINKING' && state.phase !== 'SPEAKING') return { state, actions: [] };
      return { state: { phase: 'FOLLOW_UP', until: event.at + FOLLOW_UP_MS }, actions: [] };

    case 'UTTERANCE': {
      const text = event.text.trim();
      if (!text) return same('empty');
      const expired = state.until !== undefined && event.at >= state.until;

      if (state.phase === 'THINKING' || state.phase === 'SPEAKING') {
        if (isHalt(afterWakePhrase(text) ?? text)) return { state: IDLE_STATE, actions: [{ type: 'INTERRUPT' }] };
        const command = afterWakePhrase(text) ?? text;
        if (words(command).length < 2) return same('too short to interrupt');
        if (isEcho(command, state.speaking)) return same('echo of its own voice');
        return { state: { phase: 'THINKING' }, actions: [{ type: 'INTERRUPT' }, { type: 'SEND', command }] };
      }

      const awake = (state.phase === 'LISTENING' || state.phase === 'FOLLOW_UP') && !expired;
      const afterWake = afterWakePhrase(text);
      if (!awake && afterWake === null) return same('no wake word');
      const command = afterWake ?? text;
      if (isHalt(command)) return { state: IDLE_STATE, actions: [{ type: 'INTERRUPT' }] };
      if (!command) {
        // "Jarvis" on its own: listen for the command.
        return { state: { phase: 'LISTENING', until: event.at + LISTEN_MS }, actions: [] };
      }
      return { state: { phase: 'THINKING' }, actions: [{ type: 'SEND', command }] };
    }
  }
}
