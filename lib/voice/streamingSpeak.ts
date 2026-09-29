/**
 * Speak while the model is still writing.
 *
 * The old path awaited the whole completion, then spoke it in one go, so the
 * owner heard nothing until the last token. Here tokens flow through two
 * small pure stages and each complete sentence goes to the voice at once:
 *
 *   token → ThinkFilter (drops <think>…</think> as it streams)
 *         → SentenceBuffer (releases whole sentences; a long run without
 *           punctuation is cut at a word boundary so it never stalls)
 *         → SpeechQueue (lib/voice/speechQueue.ts)
 *
 * Both stages are pure and unit-tested.
 */

const OPEN_OR_CLOSE = /<\s*(\/?)\s*think\s*>/i;

/** True when `tail` could still grow into a <think> or </think> tag. */
function couldBeTagStart(tail: string): boolean {
  return /^<\s*\/?\s*(t(h(i(n(k\s*)?)?)?)?)?$/i.test(tail);
}

/**
 * Removes reasoning from a token stream. Tags split across tokens ("<th" +
 * "ink>") are handled by holding back a tail that may still become a tag.
 * A closing tag with nothing open is dropped (what came before it may
 * already have been spoken — it cannot be taken back, only not repeated).
 */
export class ThinkFilter {
  private pending = '';
  private depth = 0;

  push(token: string): string {
    this.pending += token;
    let visible = '';
    for (;;) {
      const match = OPEN_OR_CLOSE.exec(this.pending);
      if (!match) break;
      const before = this.pending.slice(0, match.index);
      if (this.depth === 0) visible += before;
      if (match[1] === '/') this.depth = Math.max(0, this.depth - 1);
      else this.depth += 1;
      this.pending = this.pending.slice(match.index + match[0].length);
    }
    // Keep back a trailing "<…" that may still turn into a tag.
    const lt = this.pending.lastIndexOf('<');
    let keep = '';
    if (lt >= 0 && couldBeTagStart(this.pending.slice(lt))) {
      keep = this.pending.slice(lt);
      this.pending = this.pending.slice(0, lt);
    }
    if (this.depth === 0) visible += this.pending;
    this.pending = keep;
    return visible;
  }

  /** End of stream: a held "<…" that never became a tag is ordinary text. */
  flush(): string {
    const rest = this.depth === 0 ? this.pending : '';
    this.pending = '';
    return rest;
  }

  reset(): void {
    this.pending = '';
    this.depth = 0;
  }
}

/** Sentence ends: . ! ? … and the Arabic question mark, followed by a space. */
const SENTENCE_END = /([.!?…؟。]+["')\]]*)\s+/g;
/** A run this long with no sentence end is spoken anyway, cut at a word. */
export const MAX_CHUNK = 200;

/** Markdown and symbols a voice should not read out. */
export function speakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|[-*•]|\d+[.)])\s+/gm, '')
    .replace(/[*_~#>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export class SentenceBuffer {
  private text = '';

  append(chunk: string): void {
    this.text += chunk;
  }

  /** Sentences that are complete now. What is left waits for more tokens. */
  drain(): string[] {
    const out: string[] = [];
    let last = 0;
    SENTENCE_END.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = SENTENCE_END.exec(this.text))) {
      const end = match.index + match[1]!.length;
      const sentence = speakable(this.text.slice(last, end));
      if (sentence) out.push(sentence);
      last = match.index + match[0].length;
    }
    // A new line is also a boundary (lists, short replies).
    const newline = this.text.lastIndexOf('\n');
    if (newline >= last) {
      for (const line of this.text.slice(last, newline).split('\n')) {
        const sentence = speakable(line);
        if (sentence) out.push(sentence);
      }
      last = newline + 1;
    }
    this.text = this.text.slice(last);
    // Never stall on a long unpunctuated stretch: cut at the last word boundary.
    while (this.text.length > MAX_CHUNK) {
      const cut = this.text.lastIndexOf(' ', MAX_CHUNK);
      const at = cut > 0 ? cut : MAX_CHUNK;
      const piece = speakable(this.text.slice(0, at));
      if (piece) out.push(piece);
      this.text = this.text.slice(at).replace(/^\s+/, '');
    }
    return out;
  }

  /** End of the answer: whatever is left, as one last piece. */
  flush(): string[] {
    const out = this.drain();
    const rest = speakable(this.text);
    this.text = '';
    if (rest) out.push(rest);
    return out;
  }

  /** A killed turn: drop everything so none of it leaks into the next. */
  reset(): void {
    this.text = '';
  }
}
