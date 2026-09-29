import { describe, expect, it } from 'vitest';
import { isComplete, looksLikeTflite, WAKE_MODEL_FILES } from '@/lib/voice/wakeModelFiles';
import { cleanTranscript } from '@/lib/voice/transcriptClean';
import { SpeechQueue, type Speaker } from '@/lib/voice/speechQueue';

const tfl3 = new Uint8Array([0x1c, 0, 0, 0, 0x54, 0x46, 0x4c, 0x33]);

describe('wake-word model files', () => {
  it('accepts only the exact published TFLite file', () => {
    const jarvis = WAKE_MODEL_FILES.find((file) => file.role === 'wakeWord')!;
    expect(isComplete(jarvis, 1_278_912, tfl3)).toBe(true);
    expect(isComplete(jarvis, 1_278_911, tfl3)).toBe(false);
    // An HTML error page saved under the right name is rejected.
    expect(looksLikeTflite(new TextEncoder().encode('<!DOCTYPE html>'))).toBe(false);
  });
  it('covers the three files the engine needs', () => {
    expect(WAKE_MODEL_FILES.map((file) => file.role).sort()).toEqual(['embedding', 'melspec', 'wakeWord']);
  });
});

describe('Whisper sound labels never become words', () => {
  it('drops the labels from the owner video', () => {
    expect(cleanTranscript("Jove. Joe. (Bell) y'all Jarvis")).toBe("Jove. Joe. y'all Jarvis");
    expect(cleanTranscript('[BLANK_AUDIO]')).toBe('');
    expect(cleanTranscript('*coughs* open camera ♪♪')).toBe('open camera');
  });
});

describe('the queue tells the loop what it is saying (for the echo guard)', () => {
  it('reports each sentence as it goes to the voice', () => {
    const said: string[] = [];
    const speaker: Speaker = { speak: () => undefined, stop: () => undefined };
    const queue = new SpeechQueue(speaker, { onSentence: (text) => said.push(text) });
    queue.enqueue('One.');
    queue.enqueue('Two.');
    queue.enqueue('Three.');
    expect(said).toEqual(['One.', 'Two.']);
  });
});
