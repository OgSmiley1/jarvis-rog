import { beforeEach, describe, expect, it } from 'vitest';
import { spokenLog } from './stubs/expo-speech';
import { createThinkFilter, stripThinking } from '@/lib/voice/stripThinking';
import { speakQueued, speakResponse } from '@/lib/voice/voiceResponse';
import { SpeechStream } from '@/lib/voice/speechStream';

/**
 * Checkpoint 2 of the Core brief: reasoning must never reach the screen or
 * the speaker. These tests pin every path the owner can see or hear.
 */
describe('think leak — the speaker', () => {
  beforeEach(() => {
    spokenLog.length = 0;
  });

  it('speakResponse never hands reasoning to the engine', async () => {
    await speakResponse('<think>the user wants the time</think>It is nine.', 'en');
    expect(spokenLog).toEqual(['It is nine.']);
  });

  it('speakResponse refuses a reply that was only reasoning', async () => {
    await expect(speakResponse('<think>hmm, let me see', 'en')).rejects.toThrow('TTS_EMPTY_TEXT');
    expect(spokenLog).toEqual([]);
  });

  it('speakQueued drops a segment that is only reasoning and speaks the rest', async () => {
    await speakQueued('<think>planning</think>', 'en');
    await speakQueued('Hello, Smiley.', 'en');
    expect(spokenLog).toEqual(['Hello, Smiley.']);
  });
});

describe('think leak — the token stream', () => {
  it('holds a tag split across arbitrary chunks', () => {
    const filter = createThinkFilter();
    const chunks = ['<th', 'ink>the owner', ' asked</', 'thi', 'nk>Twenty', ' degrees.'];
    const visible = chunks.map((chunk) => filter.push(chunk)).join('') + filter.end();
    expect(visible).toBe('Twenty degrees.');
  });

  it('drops an unclosed block at the end of the stream', () => {
    const filter = createThinkFilter();
    const visible = filter.push('Sure. <think>and then I') + filter.push(' will') + filter.end();
    expect(visible).toBe('Sure. ');
  });

  it('feeds sentence segmentation only visible text', () => {
    const filter = createThinkFilter();
    const stream = new SpeechStream();
    const spoken: string[] = [];
    for (const token of ['<think>', 'Plan: say hi.', '</think>', 'Hi there. ', 'Ready.']) {
      spoken.push(...stream.push(filter.push(token)));
    }
    spoken.push(...stream.push(filter.end()), ...stream.flush());
    expect(spoken.join(' ')).not.toMatch(/Plan|think/i);
    expect(spoken.join(' ')).toContain('Hi there.');
  });
});

describe('think leak — the screen', () => {
  it('handles nested, stray and case-varied tags', () => {
    expect(stripThinking('<THINK>a<think>b</think>c</THINK>Answer')).toBe('Answer');
    expect(stripThinking('Answer</think>')).toBe('Answer');
    expect(stripThinking('No tags at all.')).toBe('No tags at all.');
  });
});


it('keeps nested reasoning hidden when both tags arrive in separate chunks', () => {
  const filter = createThinkFilter();
  const chunks = ['<think>outer<th', 'ink>inner</think>outer secret</thi', 'nk>Visible.'];
  expect(chunks.map((token) => filter.push(token)).join('') + filter.end()).toBe('Visible.');
});
