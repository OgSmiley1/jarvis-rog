import * as Speech from 'expo-speech';
import { stripThinking } from './stripThinking';
import type { Speaker } from './speechQueue';

export type VoiceLanguage = 'en' | 'ar';

export function ttsLanguage(language: VoiceLanguage): string {
  return language === 'ar' ? 'ar-001' : 'en-US';
}

/**
 * The one place JARVIS's voice starts. Every caller (the home screen's auto
 * speak and Speak button, the assistant.speak tool) goes through here, so the
 * model's <think> reasoning is removed once, for all of them, before a single
 * word reaches the speaker.
 */
export function speakResponse(text: string, language: VoiceLanguage): void {
  if (!text.trim()) throw new Error('TTS_EMPTY_TEXT');
  const spoken = stripThinking(text);
  Speech.stop();
  // Nothing left but reasoning: stay silent rather than read it.
  if (!spoken) return;
  Speech.speak(spoken, { language: ttsLanguage(language), rate: 1.0, pitch: 1.0 });
}

export function stopSpeaking(): void {
  Speech.stop();
}

/**
 * The phone's own voice as a queue speaker. expo-speech queues each speak()
 * behind the one playing, so the SpeechQueue can hand it the next sentence
 * early and there is no gap between sentences.
 */
export function systemSpeaker(language: () => VoiceLanguage): Speaker {
  return {
    speak(text, callbacks) {
      Speech.speak(text, {
        language: ttsLanguage(language()),
        rate: 1.0,
        pitch: 1.0,
        onStart: callbacks.onStart,
        onDone: callbacks.onDone,
        onStopped: callbacks.onDone,
        onError: (error) => callbacks.onError?.(error),
      });
    },
    stop() {
      Speech.stop();
    },
  };
}

/** Binds the phone's speech engine before the first answer, so sentence one is not the one paying for it. */
export function warmVoice(): void {
  void Speech.getAvailableVoicesAsync().catch(() => undefined);
}
