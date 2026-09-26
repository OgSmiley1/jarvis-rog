/**
 * Barge-in: the one command that must never wait for a model.
 *
 * In an ambient HUD there is no "close the app" gesture for a voice session —
 * if JARVIS starts speaking something long, or starts generating against the
 * wrong request, the owner needs a word that stops it instantly. Routing that
 * word through the LLM would make the halt as slow as the thing being halted,
 * so it is matched here and handled by the HUD directly.
 *
 * Kept deliberately narrow: whole utterances only. "Stop the car at the
 * roundabout" is a request to answer, not a request to shut up.
 */

const HALT_PHRASES = [
  // English
  'stop',
  'stop it',
  'stop talking',
  'be quiet',
  'quiet',
  'silence',
  'shut up',
  'cancel',
  'halt',
  'enough',
  'nevermind',
  'never mind',
  // Arabic
  'قف',
  'توقف',
  'اسكت',
  'إسكت',
  'اصمت',
  'كفى',
  'كفاية',
  'خلاص',
  'الغِ',
  'الغي',
  'ألغِ',
];

const WAKE_PREFIX = /^(?:jarvis|جارفيس|جارفس|جارفز)[\s,:;.!?،؟-]*/iu;
const TRAILING_PUNCTUATION = /[\s.!?,;:،؟]+$/u;

/** True when the whole utterance is an instruction to stop, in English or Arabic. */
export function isHaltCommand(text: string): boolean {
  const cleaned = text
    .trim()
    .replace(WAKE_PREFIX, '')
    .replace(TRAILING_PUNCTUATION, '')
    .trim()
    .toLowerCase();

  if (!cleaned) return false;
  return HALT_PHRASES.includes(cleaned);
}

/** What JARVIS says back after standing down. Short by design. */
export function haltAcknowledgement(language: 'auto' | 'en' | 'ar'): string {
  return language === 'ar' ? 'حاضر.' : 'Standing down.';
}
