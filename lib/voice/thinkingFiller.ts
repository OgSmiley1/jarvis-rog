/**
 * What JARVIS says when the brain has not produced its first sentence yet,
 * as the reference assistant does ("Let me think about that for you."). It is
 * said at most once per question, only after a short silence, so a fast answer
 * never gets a filler in front of it.
 */

/** Silence after a spoken question before the filler is said. */
export const FILLER_AFTER_MS = 1_200;

const PHRASES: Record<'en' | 'ar', string[]> = {
  en: ['Let me think about that for you.', 'One moment.', 'Give me a second.', 'Let me check.'],
  ar: ['دعني أفكر في ذلك.', 'لحظة من فضلك.', 'ثانية واحدة.', 'دعني أتحقق.'],
};

/** A filler for this turn; `turn` rotates them so JARVIS does not repeat itself. */
export function thinkingFiller(language: string, turn: number): string {
  const list = PHRASES[language === 'ar' ? 'ar' : 'en'];
  return list[Math.abs(Math.trunc(turn)) % list.length]!;
}
