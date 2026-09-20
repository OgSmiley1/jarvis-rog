const DEFAULT_WAKE_WORDS = [
  'jarvis',
  'جارفيس',
  'جارفس',
  'جارفز',
] as const;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&');
}

export interface WakeWordResult {
  heard: boolean;
  command: string;
}

/**
 * Finds the owner wake word and returns only the command spoken after it.
 * English is case-insensitive and a few common Arabic spellings are accepted.
 */
export function extractWakeCommand(text: string, preferredWakeWord = 'jarvis'): WakeWordResult {
  const source = text.trim();
  if (!source) return { heard: false, command: '' };

  const candidates = [preferredWakeWord.trim(), ...DEFAULT_WAKE_WORDS].filter(Boolean);

  for (const candidate of [...new Set(candidates)]) {
    const pattern = new RegExp(escapeRegExp(candidate), 'iu');
    const match = pattern.exec(source);
    if (!match || match.index === undefined) continue;

    const after = source
      .slice(match.index + match[0].length)
      .replace(/^[\s,:;.!?،؟-]+/u, '')
      .trim();

    return { heard: true, command: after };
  }

  return { heard: false, command: '' };
}
