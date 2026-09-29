import { beforeEach, describe, expect, it } from 'vitest';
import { resetSpeech, spokenLog } from '../stubs/expo-speech';
import { speakResponse } from '@/lib/voice/voiceResponse';

describe('speakResponse — the one voice choke point', () => {
  beforeEach(() => resetSpeech());

  it('speaks the answer, never the reasoning', () => {
    speakResponse('<think>They want the weather. Check…</think>It is sunny in Dubai.', 'en');
    expect(spokenLog).toHaveLength(1);
    expect(spokenLog[0]!.text).toBe('It is sunny in Dubai.');
  });

  it('stays silent when there is only reasoning (an answer cut off mid-thought)', () => {
    speakResponse('<think>Still deciding what to', 'en');
    expect(spokenLog).toHaveLength(0);
  });

  it('uses the Arabic voice for Arabic', () => {
    speakResponse('<think>x</think>مرحبا', 'ar');
    expect(spokenLog[0]).toMatchObject({ text: 'مرحبا', options: { language: 'ar-001' } });
  });

  it('refuses empty text, as before', () => {
    expect(() => speakResponse('   ', 'en')).toThrow('TTS_EMPTY_TEXT');
  });
});
