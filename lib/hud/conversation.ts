import type { CompletionMessage } from '@/lib/inference/types';

/**
 * The ambient HUD's short-term conversational memory.
 *
 * The HUD was calling `ask()` with no history, so every spoken utterance was a
 * cold start: "what's the weather in Ajman" then "and tomorrow?" produced an
 * answer to "and tomorrow?" with nothing to attach it to. A voice assistant
 * that cannot be followed up on is a command line you happen to shout at.
 *
 * Deliberately bounded and in-memory only. Anything the owner wants kept goes
 * through the existing Chat conversation records or approved memory — this is
 * the last few turns, not a second persistence layer competing with SQLite.
 */

/** Messages retained, counting both sides. Matches the Chat screen's window. */
export const HUD_HISTORY_LIMIT = 12;

export function appendTurn(
  history: CompletionMessage[],
  role: CompletionMessage['role'],
  content: string,
  limit = HUD_HISTORY_LIMIT,
): CompletionMessage[] {
  const clean = content.trim();
  if (!clean) return history;
  return [...history, { role, content: clean }].slice(-limit);
}

/**
 * Record one completed exchange. The pair is appended together so history can
 * never hold a question with no answer — a dangling user turn makes the next
 * prompt read as if JARVIS ignored it.
 */
export function appendExchange(
  history: CompletionMessage[],
  userText: string,
  assistantText: string,
  limit = HUD_HISTORY_LIMIT,
): CompletionMessage[] {
  const user = userText.trim();
  const assistant = assistantText.trim();
  if (!user || !assistant) return history;
  return appendTurn(appendTurn(history, 'user', user, limit + 1), 'assistant', assistant, limit);
}

/**
 * A follow-up ("and tomorrow?", "وكمان؟") is unanswerable without history, so
 * it is worth knowing when one has been asked — it is the case where dropping
 * context is most obviously wrong.
 */
export function looksLikeFollowUp(text: string): boolean {
  const clean = text.trim().toLowerCase();
  if (!clean) return false;
  if (clean.split(/\s+/).length > 6) return false;
  // The boundary is a lookahead rather than \b: \b is defined over ASCII word
  // characters, so it never matches between two Arabic letters and "وكمان؟"
  // would be missed entirely. Longest alternatives first.
  return /^(?:what about|how about|what else|and then|وبعد كده|وبعدين|وماذا|وكمان|وبعد|and|then|also|why|طيب|ليش)(?![\p{L}\p{N}])/u.test(clean);
}
