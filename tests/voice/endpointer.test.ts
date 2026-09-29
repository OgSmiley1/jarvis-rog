import { describe, expect, it } from 'vitest';
import { Endpointer, speechScore, toInt16, type EndpointEvent } from '@/lib/voice/endpointer';

const FRAME = 1600; // 100 ms at 16 kHz
const tone = (amp: number) => {
  const f = new Float32Array(FRAME);
  for (let i = 0; i < FRAME; i += 1) f[i] = amp * Math.sin(i / 3);
  return f;
};
const QUIET = () => tone(0.002);
const VOICE = () => tone(0.2);

function feed(ep: Endpointer, frames: Float32Array[]): EndpointEvent[] {
  return frames.flatMap((f) => ep.push(f));
}
const times = (n: number, make: () => Float32Array) => Array.from({ length: n }, make);

describe('Endpointer — the turn ends by itself', () => {
  it('opens on speech, closes after 0.8 s of silence, with no manual stop', () => {
    const ep = new Endpointer();
    const events = feed(ep, [...times(10, QUIET), ...times(12, VOICE), ...times(9, QUIET)]);
    expect(events.map((e) => e.type)).toEqual(['start', 'end']);
  });

  it('the utterance keeps the pre-roll and drops the trailing silence', () => {
    const ep = new Endpointer();
    const events = feed(ep, [...times(10, QUIET), ...times(12, VOICE), ...times(9, QUIET)]);
    const end = events.find((e) => e.type === 'end') as Extract<EndpointEvent, { type: 'end' }>;
    // 12 frames of voice plus about 250 ms before it — no trailing 0.8 s of silence.
    expect(end.audio.length).toBeGreaterThanOrEqual(14 * FRAME);
    expect(end.audio.length).toBeLessThanOrEqual(16 * FRAME);
  });

  it('a click shorter than 250 ms never opens', () => {
    const ep = new Endpointer();
    expect(feed(ep, [...times(10, QUIET), VOICE(), VOICE(), ...times(12, QUIET)])).toEqual([]);
  });

  it('a pause shorter than 0.8 s does not split a sentence', () => {
    const ep = new Endpointer();
    const events = feed(ep, [...times(10, QUIET), ...times(6, VOICE), ...times(5, QUIET), ...times(6, VOICE), ...times(9, QUIET)]);
    expect(events.filter((e) => e.type === 'end')).toHaveLength(1);
  });

  it('never holds an utterance longer than 15 s', () => {
    const ep = new Endpointer();
    const events = feed(ep, [...times(10, QUIET), ...times(200, VOICE)]);
    expect(events.filter((e) => e.type === 'end').length).toBeGreaterThanOrEqual(1);
  });

  it('scores loudness against the room', () => {
    expect(speechScore(0.003, 0.003)).toBe(0);
    expect(speechScore(0.3, 0.003)).toBe(1);
  });

  it('converts to 16-bit PCM for the wake-word engine', () => {
    expect(Array.from(toInt16(new Float32Array([0, 1, -1, 2])))).toEqual([0, 32767, -32768, 32767]);
  });
});
