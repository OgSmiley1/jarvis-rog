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
 * Accepts the wake word only at the start of the utterance, optionally after
 * a short greeting such as "hey" or Arabic "يا". This prevents ordinary
 * sentences that merely mention JARVIS from triggering actions.
 */
export function extractWakeCommand(text: string, preferredWakeWord = 'jarvis'): WakeWordResult {
  const source = text.trim();
  if (!source) return { heard: false, command: '' };

  const candidates = [preferredWakeWord.trim(), ...DEFAULT_WAKE_WORDS].filter(Boolean);

  for (const candidate of [...new Set(candidates)]) {
    const pattern = new RegExp(
      `^(?:(?:hey|hi)\\s+|يا\\s+)?${escapeRegExp(candidate)}(?=$|[\\s,:;.!?،؟-])`,
      'iu',
    );
    const match = pattern.exec(source);
    if (!match) continue;

    const after = source
      .slice(match[0].length)
      .replace(/^[\s,:;.!?،؟-]+/u, '')
      .trim();

    return { heard: true, command: after };
  }

  return { heard: false, command: '' };
}
