import { describe, expect, it } from 'vitest';
import { appendExchange, appendTurn, HUD_HISTORY_LIMIT, looksLikeFollowUp } from '@/lib/hud/conversation';

describe('HUD conversational memory', () => {
  it('records a completed exchange as user then assistant', () => {
    const history = appendExchange([], 'what is the battery at', 'Sixty percent.');
    expect(history).toEqual([
      { role: 'user', content: 'what is the battery at' },
      { role: 'assistant', content: 'Sixty percent.' },
    ]);
  });

  it('never stores a question with no answer', () => {
    expect(appendExchange([], 'what about tomorrow', '')).toEqual([]);
    expect(appendExchange([], '', 'Sixty percent.')).toEqual([]);
  });

  it('keeps the window bounded so the prompt cannot grow without limit', () => {
    let history = appendExchange([], 'first question', 'first answer');
    for (let turn = 0; turn < 20; turn += 1) {
      history = appendExchange(history, `question ${turn}`, `answer ${turn}`);
    }

    expect(history).toHaveLength(HUD_HISTORY_LIMIT);
    expect(history.map((message) => message.content)).not.toContain('first question');
    expect(history[history.length - 1]).toEqual({ role: 'assistant', content: 'answer 19' });
  });

  it('keeps each retained exchange paired', () => {
    let history: ReturnType<typeof appendExchange> = [];
    for (let turn = 0; turn < 20; turn += 1) {
      history = appendExchange(history, `question ${turn}`, `answer ${turn}`);
    }

    for (let index = 0; index < history.length; index += 2) {
      expect(history[index]?.role).toBe('user');
      expect(history[index + 1]?.role).toBe('assistant');
    }
  });

  it('ignores an empty turn rather than padding the history', () => {
    expect(appendTurn([], 'user', '   ')).toEqual([]);
  });

  it('recognises a short follow-up in English and Arabic', () => {
    expect(looksLikeFollowUp('and tomorrow?')).toBe(true);
    expect(looksLikeFollowUp('what about Dubai')).toBe(true);
    expect(looksLikeFollowUp('وكمان؟')).toBe(true);
  });

  it('does not treat a full standalone request as a follow-up', () => {
    expect(looksLikeFollowUp('what is the weather in Ajman tomorrow morning please')).toBe(false);
    expect(looksLikeFollowUp('open spotify')).toBe(false);
    expect(looksLikeFollowUp('')).toBe(false);
  });
});
