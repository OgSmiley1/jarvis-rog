import * as Speech from 'expo-speech';

export type VoiceLanguage = 'en' | 'ar';

export interface SpeakResponseOptions {
  onStart?: () => void;
  onDone?: () => void;
  onError?: (error: Error) => void;
}

export function ttsLanguage(language: VoiceLanguage): string {
  return language === 'ar' ? 'ar-001' : 'en-GB';
}

async function preferredSystemVoice(language: VoiceLanguage): Promise<string | undefined> {
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const wantedPrefix = language === 'ar' ? 'ar' : 'en-gb';
    const candidates = voices.filter((voice) => voice.language.toLowerCase().startsWith(wantedPrefix));
    const enhanced = candidates.find((voice) => String(voice.quality).toLowerCase() === 'enhanced');
    return (enhanced ?? candidates[0])?.identifier;
  } catch {
    return undefined;
  }
}

export async function speakResponse(
  text: string,
  language: VoiceLanguage,
  options: SpeakResponseOptions = {},
): Promise<void> {
  const clean = text.trim();
  if (!clean) throw new Error('TTS_EMPTY_TEXT');

  await Speech.stop();
  const voice = await preferredSystemVoice(language);

  await new Promise<void>((resolve, reject) => {
    Speech.speak(clean, {
      language: ttsLanguage(language),
      ...(voice ? { voice } : {}),
      rate: language === 'en' ? 0.94 : 0.98,
      pitch: language === 'en' ? 0.92 : 1.0,
      onStart: options.onStart,
      onDone: () => {
        options.onDone?.();
        resolve();
      },
      onStopped: () => {
        options.onDone?.();
        resolve();
      },
      onError: (error) => {
        options.onError?.(error);
        reject(error);
      },
    });
  });
}

/**
 * Speak one segment of a streaming answer, without cutting off what is
 * already playing.
 *
 * `speakResponse` calls `Speech.stop()` first, which is right for a single
 * complete answer and fatally wrong for a stream — each new sentence would
 * silence the previous one and the owner would hear only the last. The system
 * engine maintains its own utterance queue, so successive calls play in order
 * and the voice runs continuously while the model is still generating.
 *
 * Resolves when this segment finishes so the caller can track when JARVIS has
 * actually stopped talking.
 */
export async function speakQueued(
  text: string,
  language: VoiceLanguage,
  options: SpeakResponseOptions = {},
): Promise<void> {
  const clean = text.trim();
  if (!clean) return;

  const voice = await preferredSystemVoice(language);

  await new Promise<void>((resolve) => {
    Speech.speak(clean, {
      language: ttsLanguage(language),
      ...(voice ? { voice } : {}),
      rate: language === 'en' ? 0.94 : 0.98,
      pitch: language === 'en' ? 0.92 : 1.0,
      onStart: options.onStart,
      onDone: () => {
        options.onDone?.();
        resolve();
      },
      onStopped: () => {
        options.onDone?.();
        resolve();
      },
      onError: (error) => {
        // A failed segment must not strand the queue: report it and let the
        // rest of the answer continue.
        options.onError?.(error);
        resolve();
      },
    });
  });
}

export async function stopSpeaking(): Promise<void> {
  await Speech.stop();
}
