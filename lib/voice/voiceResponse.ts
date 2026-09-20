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

export async function stopSpeaking(): Promise<void> {
  await Speech.stop();
}
