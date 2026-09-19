import * as Speech from 'expo-speech';

export type VoiceLanguage = 'en' | 'ar';

export function ttsLanguage(language: VoiceLanguage): string {
  return language === 'ar' ? 'ar-001' : 'en-US';
}

export function speakResponse(text: string, language: VoiceLanguage): void {
  const clean = text.trim();
  if (!clean) throw new Error('TTS_EMPTY_TEXT');
  Speech.stop();
  Speech.speak(clean, { language: ttsLanguage(language), rate: 1.0, pitch: 1.0 });
}

export function stopSpeaking(): void {
  Speech.stop();
}
