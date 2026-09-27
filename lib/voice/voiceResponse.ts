import * as Speech from 'expo-speech';
import { prosodyFor, rankVoices, selectVoice, type DeviceVoice, type RankedVoice } from './voiceCatalog';
import { stripThinking } from './stripThinking';

export type VoiceLanguage = 'en' | 'ar';

export interface SpeakResponseOptions {
  onStart?: () => void;
  onDone?: () => void;
  onError?: (error: Error) => void;
}

export interface VoicePreference {
  /** Allow Google's server-synthesised voices. Best quality, needs internet. */
  allowNetwork?: boolean;
  /** An identifier the owner pinned in Settings. */
  preferredIdentifier?: string;
}

export function ttsLanguage(language: VoiceLanguage): string {
  return language === 'ar' ? 'ar-001' : 'en-GB';
}

let preference: VoicePreference = {};
let voiceCache: DeviceVoice[] | null = null;
let lastChosen: { language: VoiceLanguage; chosen: RankedVoice | undefined } | null = null;

/** Settings writes the owner's choice here; speech reads it on the next call. */
export function setVoicePreference(next: VoicePreference): void {
  preference = next;
  lastChosen = null;
}

/** Enumerate once per process: the platform call is slow and the list is static. */
async function deviceVoices(refresh = false): Promise<DeviceVoice[]> {
  if (voiceCache && !refresh) return voiceCache;
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    voiceCache = voices.map((voice) => ({
      identifier: voice.identifier,
      name: voice.name,
      quality: String(voice.quality),
      language: voice.language,
    }));
  } catch {
    // Enumeration can fail before the TTS engine has bound. Cache nothing, so
    // the next call retries rather than pinning an empty list.
    return [];
  }
  return voiceCache;
}

async function chooseVoice(language: VoiceLanguage): Promise<RankedVoice | undefined> {
  if (lastChosen?.language === language) return lastChosen.chosen;
  const chosen = selectVoice(await deviceVoices(), { language, ...preference });
  lastChosen = { language, chosen };
  return chosen;
}

/**
 * What Settings displays: the voice actually in use and the alternatives, as
 * the device reported them. Never a claim about a voice that is not installed.
 */
export async function describeVoices(language: VoiceLanguage): Promise<{
  chosen?: RankedVoice;
  candidates: RankedVoice[];
}> {
  const voices = await deviceVoices(true);
  lastChosen = null;
  return {
    chosen: await chooseVoice(language),
    candidates: rankVoices(voices, { language, ...preference }),
  };
}

/** Speak one short line so the owner can hear a voice before pinning it. */
export async function previewVoice(identifier: string, language: VoiceLanguage): Promise<void> {
  await Speech.stop();
  const voices = await deviceVoices();
  const voice = voices.find((candidate) => candidate.identifier === identifier);
  const { rate, pitch } = prosodyFor(voice, language);
  const sample = language === 'ar'
    ? 'مساء الخير يا سمايلي. الأنظمة جاهزة.'
    : 'Good evening, Smiley. All systems are ready.';

  await new Promise<void>((resolve) => {
    Speech.speak(sample, {
      language: ttsLanguage(language),
      voice: identifier,
      rate,
      pitch,
      onDone: () => resolve(),
      onStopped: () => resolve(),
      onError: () => resolve(),
    });
  });
}

export async function speakResponse(
  text: string,
  language: VoiceLanguage,
  options: SpeakResponseOptions = {},
): Promise<void> {
  const clean = stripThinking(text).trim();
  if (!clean) throw new Error('TTS_EMPTY_TEXT');

  await Speech.stop();
  const chosen = await chooseVoice(language);
  const { rate, pitch } = prosodyFor(chosen?.voice, language);

  await new Promise<void>((resolve, reject) => {
    Speech.speak(clean, {
      language: ttsLanguage(language),
      ...(chosen ? { voice: chosen.voice.identifier } : {}),
      rate,
      pitch,
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
  const clean = stripThinking(text).trim();
  if (!clean) return;

  const chosen = await chooseVoice(language);
  const { rate, pitch } = prosodyFor(chosen?.voice, language);

  await new Promise<void>((resolve) => {
    Speech.speak(clean, {
      language: ttsLanguage(language),
      ...(chosen ? { voice: chosen.voice.identifier } : {}),
      rate,
      pitch,
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
