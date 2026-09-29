import { describe, expect, it } from 'vitest';
import { SpeechQueue, type SpeakCallbacks, type Speaker } from '@/lib/voice/speechQueue';
import { ReplyVoice } from '@/lib/voice/replyVoice';

class FakeSpeaker implements Speaker {
  started: string[] = [];
  live: Array<{ text: string; cb: SpeakCallbacks }> = [];
  stops = 0;
  speak(text: string, cb: SpeakCallbacks) {
    this.live.push({ text, cb });
    this.started.push(text);
  }
  stop() {
    this.stops += 1;
  }
  /** The engine plays the oldest utterance to the end. */
  finishOne() {
    const next = this.live.shift();
    next?.cb.onStart?.();
    next?.cb.onDone?.();
  }
}

describe('SpeechQueue — one ordered voice', () => {
  it('keeps two sentences in the engine, in order, never more', () => {
    const s = new FakeSpeaker();
    const q = new SpeechQueue(s);
    ['A.', 'B.', 'C.'].forEach((t) => q.enqueue(t));
    expect(s.started).toEqual(['A.', 'B.']);
    s.finishOne();
    expect(s.started).toEqual(['A.', 'B.', 'C.']);
    expect(s.stops).toBe(0);
  });

  it('reports speaking and first audio once', () => {
    const s = new FakeSpeaker();
    let first = 0;
    const states: boolean[] = [];
    const q = new SpeechQueue(s, { onFirstAudio: () => (first += 1), onSpeakingChange: (v) => states.push(v) });
    q.enqueue('A.');
    q.enqueue('B.');
    s.finishOne();
    s.finishOne();
    expect(first).toBe(1);
    expect(states).toEqual([true, false]);
  });

  it('interrupt silences now, and a late callback from the old turn changes nothing', () => {
    const s = new FakeSpeaker();
    const q = new SpeechQueue(s);
    ['A.', 'B.', 'C.'].forEach((t) => q.enqueue(t));
    const stale = s.live[0]!.cb;
    q.interrupt();
    expect(s.stops).toBe(1);
    expect(q.isSpeaking).toBe(false);
    stale.onDone?.();
    expect(s.started).toEqual(['A.', 'B.']);
    q.enqueue('New.');
    expect(s.started.at(-1)).toBe('New.');
  });
});

describe('ReplyVoice — speaking while the model writes', () => {
  it('first sentence goes out before the answer ends, reasoning never', () => {
    const s = new FakeSpeaker();
    const reply = new ReplyVoice(new SpeechQueue(s));
    for (const t of ['<think>', 'plan it', '</think>', 'It is ', '9:41. ', 'Anything', ' else?']) reply.push(t);
    expect(s.started).toEqual(['It is 9:41.']);
    reply.finish('ignored when streamed');
    expect(s.started).toEqual(['It is 9:41.', 'Anything else?']);
  });

  it('a tool answer that streamed nothing is spoken whole', () => {
    const s = new FakeSpeaker();
    const reply = new ReplyVoice(new SpeechQueue(s));
    reply.finish('Opened YouTube.');
    expect(s.started).toEqual(['Opened YouTube.']);
  });

  it('a cancelled answer says nothing more', () => {
    const s = new FakeSpeaker();
    const reply = new ReplyVoice(new SpeechQueue(s));
    reply.push('Half a');
    reply.cancel();
    reply.push(' sentence. More.');
    reply.finish('x');
    expect(s.started).toEqual([]);
  });
});
