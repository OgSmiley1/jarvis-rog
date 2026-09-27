/**
 * Whisper writes sounds it hears as bracketed labels — "(Bell)", "[Music]",
 * "*sighs*" — and they reached the wake-word check and the screen as if the
 * owner had said them. Only bracketed labels are removed; words are never guessed at.
 */
export function cleanTranscript(text: string): string {
  return text
    .replace(/\([^)]*\)|\[[^\]]*\]|\*[^*]*\*|♪[^♪]*♪?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
