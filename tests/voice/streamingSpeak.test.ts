import { describe, expect, it } from 'vitest';
import { MAX_CHUNK, SentenceBuffer, speakable, ThinkFilter } from '@/lib/voice/streamingSpeak';

const run = (filter: ThinkFilter, tokens: string[]) => tokens.map((t) => filter.push(t)).join('') + filter.flush();

describe('ThinkFilter — reasoning removed from the token stream', () => {
  it('drops a span split across tokens', () => {
    expect(run(new ThinkFilter(), ['<th', 'ink>', 'secret plan', '</th', 'ink>', 'Hello.'])).toBe('Hello.');
  });
  it('never emits a partial tag as text', () => {
    const f = new ThinkFilter();
    expect(f.push('Hi <')).toBe('Hi ');
    expect(f.push('thi')).toBe('');
    expect(f.push('nk>x</think> there')).toBe(' there');
  });
  it('a lone < that never becomes a tag is kept', () => {
    expect(run(new ThinkFilter(), ['3 <', ' 5'])).toBe('3 < 5');
    expect(run(new ThinkFilter(), ['a <'])).toBe('a <');
  });
  it('an unclosed span swallows the rest', () => {
    expect(run(new ThinkFilter(), ['Ok. <think>', 'more'])).toBe('Ok. ');
  });
});

describe('SentenceBuffer — speak each sentence as soon as it is whole', () => {
  it('releases finished sentences and keeps the unfinished one', () => {
    const b = new SentenceBuffer();
    b.append('It is 9:41. The battery is');
    expect(b.drain()).toEqual(['It is 9:41.']);
    b.append(' at 64%. ');
    expect(b.drain()).toEqual(['The battery is at 64%.']);
  });
  it('does not split decimals', () => {
    const b = new SentenceBuffer();
    b.append('Pi is 3.14 roughly');
    expect(b.drain()).toEqual([]);
    expect(b.flush()).toEqual(['Pi is 3.14 roughly']);
  });
  it('handles Arabic question marks', () => {
    const b = new SentenceBuffer();
    b.append('كيف حالك؟ أنا بخير');
    expect(b.drain()).toEqual(['كيف حالك؟']);
  });
  it('never stalls: a long unpunctuated run is cut at a word', () => {
    const b = new SentenceBuffer();
    b.append('word '.repeat(80));
    const out = b.drain();
    expect(out.length).toBeGreaterThan(0);
    for (const piece of out) expect(piece.length).toBeLessThanOrEqual(MAX_CHUNK);
    expect(out[0]!.endsWith('word')).toBe(true);
  });
  it('new lines end a piece', () => {
    const b = new SentenceBuffer();
    b.append('- milk\n- eggs\n');
    expect(b.drain()).toEqual(['milk', 'eggs']);
  });
  it('reset drops a killed turn', () => {
    const b = new SentenceBuffer();
    b.append('half a sentence');
    b.reset();
    expect(b.flush()).toEqual([]);
  });
  it('speakable strips markdown', () => {
    expect(speakable('**Bold** and `code` and [link](http://x)')).toBe('Bold and code and link');
  });
});
