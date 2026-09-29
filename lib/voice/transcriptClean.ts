/**
 * Whisper writes sound labels as if they were words: "(Bell)", "[BLANK_AUDIO]",
 * "*coughs*", "♪". The owner's video showed "Jove. Joe. (Bell) y'all Jarvis"
 * for a request — these labels must never become part of a command.
 */
const LABEL = /\[[^\]]*\]|\([^)]*\)|\*[^*]*\*|♪+/g;

export function cleanTranscript(text: string): string {
  return text.replace(LABEL, ' ').replace(/\s+/g, ' ').trim();
}
