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

/**
 * Voice barge-in while JARVIS is speaking — the rule, kept separate from the
 * microphone so it can be tested and so it can only be switched on honestly.
 *
 * Today the microphone is muted while JARVIS speaks (half-duplex), because
 * nothing on this build has verified echo cancellation: without it JARVIS
 * would hear, transcribe and answer its own voice. So `echoSafe` is false and
 * the only barge-in is a tap on the Core. When a verified echo path exists,
 * an interruption still needs at least two words — a cough never cancels.
 */
export const MIN_BARGE_IN_WORDS = 2;

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/u)
    .filter(Boolean);
}

/**
 * The software echo guard. With the microphone open while JARVIS talks, the
 * recogniser hears JARVIS's own voice and transcribes it. This measures how
 * much of what was heard is JARVIS's recent speech: the fraction of heard
 * words that appear in it. 1 = all echo, 0 = nothing JARVIS said.
 */
export function echoOverlap(heard: string, spokenRecent: readonly string[]): number {
  const heardWords = words(heard);
  if (heardWords.length === 0) return 1;
  const spoken = new Set(spokenRecent.flatMap(words));
  return heardWords.filter((w) => spoken.has(w)).length / heardWords.length;
}

/** Above this share of JARVIS's own words, a transcript is treated as echo. */
export const ECHO_OVERLAP_LIMIT = 0.5;

export function bargeInDecision(input: {
  speaking: boolean;
  echoSafe: boolean;
  transcript: string;
  /** What JARVIS has said in the last few seconds — the echo it may hear. */
  spokenRecent?: readonly string[];
}): 'ignore' | 'interrupt' | 'not-speaking' {
  if (!input.speaking) return 'not-speaking';
  if (!input.echoSafe) return 'ignore';
  // Mostly JARVIS's own words: its voice coming back through the microphone.
  if (input.spokenRecent && echoOverlap(input.transcript, input.spokenRecent) > ECHO_OVERLAP_LIMIT) return 'ignore';
  const count = words(input.transcript).length;
  return count >= MIN_BARGE_IN_WORDS || isHaltCommand(input.transcript) ? 'interrupt' : 'ignore';
}

/**
 * No hardware echo cancellation is verified on this build, so voice barge-in
 * is off unless the owner switches on "Talk over JARVIS (beta)" — and then
 * the echo guard above filters JARVIS's own words.
 */
export const ECHO_SAFE = false;
