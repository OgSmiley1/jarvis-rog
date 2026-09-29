import { describe, expect, it } from 'vitest';
import { hasThinking, stripThinking } from '@/lib/voice/stripThinking';

describe('stripThinking — reasoning never reaches the owner', () => {
  it('removes a closed span', () => {
    expect(stripThinking('<think>The user wants the time. I should…</think>It is 9:41.')).toBe('It is 9:41.');
  });

  it('removes the span Qwen3 emits with blank lines around it', () => {
    expect(stripThinking('<think>\nplan\n</think>\n\nSure — opening YouTube.')).toBe('Sure — opening YouTube.');
  });

  it('an unclosed tag hides everything after it (mid-stream: say nothing yet)', () => {
    expect(stripThinking('<think>Okay, the user asked about')).toBe('');
    expect(stripThinking('Answer first. <think>then a trailing thought')).toBe('Answer first.');
  });

  it('removes nested spans whole', () => {
    expect(stripThinking('<think>a <think>b</think> c</think>Done.')).toBe('Done.');
  });

  it('a stray closing tag drops the reasoning before it', () => {
    expect(stripThinking('reasoning the template opened</think>\nThe answer.')).toBe('The answer.');
  });

  it('leaves text without tags alone', () => {
    expect(stripThinking('Battery is at 64%.')).toBe('Battery is at 64%.');
    expect(stripThinking('')).toBe('');
  });

  it('matches tags in any case and with spaces', () => {
    expect(stripThinking('< THINK >x</ think >ok')).toBe('ok');
  });

  it('keeps multiple answers around separate spans', () => {
    expect(stripThinking('One.<think>x</think> Two.<think>y</think> Three.')).toBe('One. Two. Three.');
  });

  it('works token by token, as the screen sees a stream', () => {
    const tokens = ['<th', 'ink>', 'let me', ' think', '</thi', 'nk>', 'Hello', ' there.'];
    let shown = '';
    let stream = '';
    for (const token of tokens) {
      stream += token;
      shown = stripThinking(stream);
      expect(shown).not.toMatch(/let me|think/);
    }
    expect(shown).toBe('Hello there.');
  });

  it('detects tags for the latency probe', () => {
    expect(hasThinking('a</think>b')).toBe(true);
    expect(hasThinking('plain')).toBe(false);
  });
});
