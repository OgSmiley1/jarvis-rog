import { beforeEach, describe, expect, it } from 'vitest';
import { spokenLog } from './stubs/expo-speech';
import { createThinkFilter, stripThinking } from '@/lib/voice/stripThinking';
import { speakQueued, speakResponse } from '@/lib/voice/voiceResponse';
import { cleanTranscript } from '@/lib/voice/transcriptClean';

describe('stripThinking', () => {
  it('removes closed think blocks', () => {
    expect(stripThinking('<think>let me think…</think>Hello there')).toBe('Hello there');
  });
  it('removes unclosed trailing think blocks', () => {
    expect(stripThinking('Hel<think>lo, the user is asking')).toBe('Hel');
  });
  it('removes stray closing tags', () => {
    expect(stripThinking('Hi</think> there')).toBe('Hi there');
  });
  it('leaves normal text untouched', () => {
    expect(stripThinking('Hello, how are you?')).toBe('Hello, how are you?');
  });
  it('returns empty for reasoning-only output', () => {
    expect(stripThinking('<think>…</think>')).toBe('');
  });
  it('removes the exact output seen on the ROG', () => {
    const seen =
      "<think>\nOkay, the user is asking, \"how are you?\" I need to respond as JARVIS. Let me think about the best way to answer.\n</think>\n\nAll systems nominal. How can I help?";
    expect(stripThinking(seen)).toBe('All systems nominal. How can I help?');
  });
});

describe('streaming think filter', () => {
  const run = (tokens: string[]) => {
    const filter = createThinkFilter();
    const shown: string[] = [];
    for (const token of tokens) shown.push(filter.push(token));
    shown.push(filter.end());
    return shown;
  };

  it('never emits a tag or reasoning, however the tokens are split', () => {
    const shown = run(['<th', 'ink>hmm, the user', ' wants</', 'think>Hi', ' there.']);
    expect(shown.join('')).toBe('Hi there.');
    for (const piece of shown) expect(piece).not.toMatch(/<\/?t|hmm/);
  });

  it('passes ordinary text through as it arrives', () => {
    expect(run(['Hello', ', sir', '.'])).toEqual(['Hello', ', sir', '.', '']);
  });

  it('holds back only a possible tag start, then releases it', () => {
    const filter = createThinkFilter();
    expect(filter.push('a <t')).toBe('a ');
    expect(filter.push('able')).toBe('<table');
  });

  it('drops an unclosed block when the stream ends', () => {
    expect(run(['Done.', '<think>still going']).join('')).toBe('Done.');
  });

  it('drops a stray closing tag', () => {
    expect(run(['Hi', '</think>', ' there']).join('')).toBe('Hi there');
  });

  it('every chunking of the ROG output yields the same clean answer', () => {
    const text = '<think>\nOkay, the user is asking.\n</think>\n\nI am well, thank you.';
    for (let size = 1; size <= 9; size += 1) {
      const tokens = text.match(new RegExp(`[\\s\\S]{1,${size}}`, 'g'))!;
      expect(run(tokens).join('').trim()).toBe('I am well, thank you.');
    }
  });
});

describe('speech never carries reasoning', () => {
  beforeEach(() => {
    spokenLog.length = 0;
  });

  it('speakResponse strips reasoning before the engine', async () => {
    await speakResponse('<think>Okay, the user is asking how I am…</think>I am well, thank you.', 'en');
    expect(spokenLog).toEqual(['I am well, thank you.']);
  });

  it('speakResponse refuses reasoning-only output', async () => {
    await expect(speakResponse('<think>…</think>', 'en')).rejects.toThrow('TTS_EMPTY_TEXT');
    expect(spokenLog).toEqual([]);
  });

  it('streamed segments are stripped too', async () => {
    await speakQueued('<think>planning</think>First sentence.', 'en');
    await speakQueued('<think>more</think>', 'en');
    expect(spokenLog).toEqual(['First sentence.']);
  });
});

describe('cleanTranscript', () => {
  it('drops Whisper sound labels the owner never said', () => {
    expect(cleanTranscript('Hi, how are you? (Bell) What is my charge?')).toBe('Hi, how are you? What is my charge?');
    expect(cleanTranscript('[Music] jarvis *sighs* open maps')).toBe('jarvis open maps');
  });
  it('a label on its own is nothing', () => {
    expect(cleanTranscript('(Bell)')).toBe('');
  });
  it('keeps real words, Arabic included', () => {
    expect(cleanTranscript('جارفس افتح الكاميرا')).toBe('جارفس افتح الكاميرا');
  });
});
