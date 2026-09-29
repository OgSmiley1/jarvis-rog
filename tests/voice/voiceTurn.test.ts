import { describe, expect, it } from 'vitest';
import { appendHeard, startTurn } from '@/lib/voice/voiceTurn';

describe('voice turns — nothing lingers', () => {
  it('two consecutive voice turns share nothing', () => {
    let input = '';
    input = appendHeard(input, 'what time');
    input = appendHeard(input, 'is it');
    const first = startTurn(input);
    expect(first?.command).toBe('what time is it');
    input = first!.nextInput;
    expect(input).toBe('');

    input = appendHeard(input, 'open youtube');
    const second = startTurn(input);
    expect(second?.command).toBe('open youtube');
    expect(second?.command).not.toMatch(/time/);
  });

  it('every turn clears the transcript too', () => {
    expect(startTurn('hello')?.clearTranscript).toBe(true);
  });

  it('nothing to send, no turn', () => {
    expect(startTurn('   ')).toBeNull();
  });

  it('ignores blank utterances', () => {
    expect(appendHeard('call mom', '  ')).toBe('call mom');
  });
});
