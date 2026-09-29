import { describe, expect, it } from 'vitest';
import { afterWakePhrase, FOLLOW_UP_MS, IDLE_STATE, isEcho, step, type LoopEvent, type LoopState } from '@/lib/voice/voiceLoop';

function run(events: LoopEvent[], start: LoopState = IDLE_STATE) {
  let state = start;
  const actions: string[] = [];
  for (const event of events) {
    const out = step(state, event);
    state = out.state;
    for (const a of out.actions) if (a.type !== 'IGNORED') actions.push(a.type === 'SEND' ? `SEND:${a.command}` : a.type);
  }
  return { state, actions };
}

describe('the hands-free loop', () => {
  it('"hey Jarvis, what time is it" sends the question', () => {
    expect(run([{ type: 'UTTERANCE', text: 'Hey Jarvis, what time is it?', at: 0 }]).actions).toEqual(['SEND:what time is it?']);
  });

  it('ignores the room until the wake word', () => {
    expect(run([{ type: 'UTTERANCE', text: 'pass the salt', at: 0 }]).actions).toEqual([]);
  });

  it('"Jarvis" alone, then the command', () => {
    const { actions } = run([
      { type: 'UTTERANCE', text: 'Jarvis.', at: 0 },
      { type: 'UTTERANCE', text: 'open youtube', at: 2000 },
    ]);
    expect(actions).toEqual(['SEND:open youtube']);
  });

  it('a wake-word engine hit opens listening', () => {
    expect(run([{ type: 'WAKE', at: 0 }, { type: 'UTTERANCE', text: 'call mom', at: 1500 }]).actions).toEqual(['SEND:call mom']);
  });

  it('full loop: think, speak, follow-up without the wake word, then back to idle', () => {
    const { state, actions } = run([
      { type: 'UTTERANCE', text: 'jarvis what is the weather', at: 0 },
      { type: 'REPLY_STARTED', at: 2000 },
      { type: 'REPLY_DONE', at: 6000 },
      { type: 'UTTERANCE', text: 'and tomorrow?', at: 8000 },
    ]);
    expect(actions).toEqual(['SEND:what is the weather', 'SEND:and tomorrow?']);
    expect(state.phase).toBe('THINKING');
    const after = run([{ type: 'REPLY_DONE', at: 0 }, { type: 'TICK', at: FOLLOW_UP_MS + 1 }], { phase: 'SPEAKING' });
    expect(after.state.phase).toBe('IDLE');
  });

  it('barge-in: two real words interrupt and become the new turn', () => {
    const { actions } = run([{ type: 'UTTERANCE', text: 'open whatsapp instead', at: 0 }], { phase: 'SPEAKING', speaking: 'The weather in Dubai is' });
    expect(actions).toEqual(['INTERRUPT', 'SEND:open whatsapp instead']);
  });

  it('a cough or one word never interrupts', () => {
    expect(run([{ type: 'UTTERANCE', text: 'hm', at: 0 }], { phase: 'SPEAKING' }).actions).toEqual([]);
  });

  it('its own voice coming back through the mic is not a barge-in', () => {
    const speaking = 'The weather in Dubai is sunny and thirty four degrees today';
    expect(isEcho('weather in Dubai is sunny', speaking)).toBe(true);
    expect(run([{ type: 'UTTERANCE', text: 'Dubai is sunny and thirty', at: 0 }], { phase: 'SPEAKING', speaking }).actions).toEqual([]);
  });

  it('"stop" alone halts it immediately — one word is enough for a halt', () => {
    expect(run([{ type: 'UTTERANCE', text: 'Stop.', at: 0 }], { phase: 'SPEAKING' })).toMatchObject({ actions: ['INTERRUPT'], state: { phase: 'IDLE' } });
    expect(run([{ type: 'UTTERANCE', text: 'اسكت', at: 0 }], { phase: 'THINKING' }).actions).toEqual(['INTERRUPT']);
  });

  it('the wake word over JARVIS interrupts and listens', () => {
    expect(run([{ type: 'WAKE', at: 0 }], { phase: 'SPEAKING' })).toMatchObject({ actions: ['INTERRUPT'], state: { phase: 'LISTENING' } });
  });

  it('understands Arabic and misheard wake words', () => {
    expect(afterWakePhrase('جارفيس كم الساعة')).toBe('كم الساعة');
    expect(afterWakePhrase('Jervis, open camera')).toBe('open camera');
    expect(afterWakePhrase('open camera')).toBeNull();
  });
});
