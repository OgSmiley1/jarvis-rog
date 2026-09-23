import { describe, expect, it } from 'vitest';
import { SpeechStream, stripForSpeech } from '@/lib/voice/speechStream';

/** Feed a whole answer one character at a time, as a token stream would. */
function streamAll(text: string, stream = new SpeechStream()): string[] {
  const spoken: string[] = [];
  for (const character of text) spoken.push(...stream.push(character));
  spoken.push(...stream.flush());
  return spoken;
}

describe('streaming speech segmentation', () => {
  it('releases the first sentence before the answer is finished', () => {
    const stream = new SpeechStream();
    const early = stream.push('The battery is at sixty percent. ');
    expect(early).toEqual(['The battery is at sixty percent.']);

    // Everything after it is still unspoken, which is the point: the voice
    // starts while the model is still writing.
    expect(stream.push('It should last')).toEqual([]);
  });

  it('speaks a whole answer in order, losing nothing', () => {
    const answer = 'Good morning. Your first meeting is at nine. Traffic to Dubai is light.';
    expect(streamAll(answer)).toEqual([
      'Good morning.',
      'Your first meeting is at nine.',
      'Traffic to Dubai is light.',
    ]);
  });

  it('does not split a decimal or a version number', () => {
    expect(streamAll('The model is 3.5 gigabytes on disk.')).toEqual(['The model is 3.5 gigabytes on disk.']);
  });

  it('does not split after a common abbreviation', () => {
    expect(streamAll('Call Dr. Ammar about the appointment.')).toEqual([
      'Call Dr. Ammar about the appointment.',
    ]);
  });

  it('treats a run of terminators as one boundary', () => {
    expect(streamAll('Are you serious?! That changes everything.')).toEqual([
      'Are you serious?!',
      'That changes everything.',
    ]);
  });

  it('segments Arabic on its own punctuation', () => {
    const spoken = streamAll('صباح الخير يا سمايلي؟ الجهاز جاهز الآن.');
    expect(spoken).toEqual(['صباح الخير يا سمايلي؟', 'الجهاز جاهز الآن.']);
  });

  it('still speaks when the model never punctuates', () => {
    const runOn = `${'word '.repeat(80)}`;
    const spoken = streamAll(runOn);
    expect(spoken.length).toBeGreaterThan(1);
    expect(spoken.join(' ').split(/\s+/).filter(Boolean)).toHaveLength(80);
  });

  it('never leaves text unspoken at the end of generation', () => {
    const stream = new SpeechStream();
    stream.push('One complete sentence here. And a trailing fragment');
    expect(stream.flush()).toContain('And a trailing fragment');
  });

  it('drops everything unspoken on reset, for barge-in', () => {
    const stream = new SpeechStream();
    stream.push('This is pending and should never be heard');
    stream.reset();
    expect(stream.flush()).toEqual([]);
  });

  it('does not read markdown out loud', () => {
    expect(stripForSpeech('**Important:** run `pnpm test` now')).toBe('Important: run pnpm test now');
    expect(stripForSpeech('## Heading\n- first item')).toBe('Heading\nfirst item');
    expect(stripForSpeech('See [the docs](https://example.com) for more')).toBe('See the docs for more');
  });

  it('strips a fenced code block rather than dictating it', () => {
    const spoken = stripForSpeech('Run this:\n```bash\npnpm install\n```\nThen restart.');
    expect(spoken).not.toContain('pnpm install');
    expect(spoken).toContain('Then restart.');
  });
});
