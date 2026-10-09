/**
 * Removes model reasoning blocks (e.g. Qwen3 <think>...</think>) so they are
 * never displayed or spoken. Handles closed, unclosed, and stray tags.
 * Deliberately dumb: only strips explicit tags, never guesses at prose.
 */
export function stripThinking(text: string): string {
  const filter = createThinkFilter();
  return (filter.push(text) + filter.end()).replace(/\n{3,}/g, '\n\n').trim();
}

const OPEN = '<think>';
const CLOSE = '</think>';

/** Longest suffix of `text` that is a prefix of `tag` — a tag that may still be arriving. */
function partialTagTail(text: string, tag: string): number {
  const lower = text.toLowerCase();
  for (let length = Math.min(tag.length - 1, lower.length); length > 0; length -= 1) {
    if (tag.startsWith(lower.slice(-length))) return length;
  }
  return 0;
}

/**
 * The same rule applied to a token stream. Tokens arrive in arbitrary chunks
 * ("<th", "ink>hmm</", "think>Hi"), so a possible tag prefix is held back
 * until it is proven to be a tag or not. `push` returns only the text that is
 * safe to show and speak now; `end` flushes what is left.
 */
export function createThinkFilter() {
  let depth = 0;
  let pending = '';

  function drain(final: boolean): string {
    let visible = '';
    for (;;) {
      const lower = pending.toLowerCase();
      if (depth > 0) {
        const open = lower.indexOf(OPEN);
        const close = lower.indexOf(CLOSE);
        if (open !== -1 && (close === -1 || open < close)) {
          depth += 1;
          pending = pending.slice(open + OPEN.length);
          continue;
        }
        if (close === -1) {
          // Nested tags can be split across tokens too.
          const hold = Math.max(partialTagTail(pending, OPEN), partialTagTail(pending, CLOSE));
          pending = final ? '' : pending.slice(pending.length - hold);
          return visible;
        }
        pending = pending.slice(close + CLOSE.length);
        depth -= 1;
        continue;
      }
      const open = lower.indexOf(OPEN);
      const strayClose = lower.indexOf(CLOSE);
      if (strayClose !== -1 && (open === -1 || strayClose < open)) {
        visible += pending.slice(0, strayClose);
        pending = pending.slice(strayClose + CLOSE.length);
        continue;
      }
      if (open !== -1) {
        visible += pending.slice(0, open);
        pending = pending.slice(open + OPEN.length);
        depth = 1;
        continue;
      }
      const hold = final ? 0 : Math.max(partialTagTail(pending, OPEN), partialTagTail(pending, CLOSE));
      visible += pending.slice(0, pending.length - hold);
      pending = pending.slice(pending.length - hold);
      return visible;
    }
  }

  return {
    push(token: string): string {
      pending += token;
      return drain(false);
    },
    end(): string {
      return drain(true);
    },
  };
}
