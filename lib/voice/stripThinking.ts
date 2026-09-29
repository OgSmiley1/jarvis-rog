/**
 * Qwen3 and similar models may write their reasoning between <think> and
 * </think> before the answer. That text is for the model, not the owner: it
 * must never be shown on screen or read aloud.
 *
 * Rules, in order:
 * - a closed span <think>…</think> is removed, including nested spans;
 * - an unclosed <think> removes everything after it (the answer has not
 *   started yet — during streaming this keeps the screen and voice silent
 *   instead of leaking half a thought);
 * - a stray </think> with no opening tag (templates that put <think> in the
 *   prompt) removes everything before it, because that text was reasoning.
 * Tags match in any case and with spaces inside the brackets.
 */

const TAG = /<\s*(\/?)\s*think\s*>/gi;

export function stripThinking(text: string): string {
  if (!text) return '';
  let output = '';
  let depth = 0;
  let cursor = 0;
  for (const match of text.matchAll(TAG)) {
    const closing = match[1] === '/';
    const at = match.index ?? 0;
    if (!closing) {
      if (depth === 0) output += text.slice(cursor, at);
      depth += 1;
    } else if (depth > 0) {
      depth -= 1;
    } else {
      // A close with nothing open: everything so far was reasoning.
      output = '';
    }
    cursor = at + match[0].length;
  }
  if (depth === 0) output += text.slice(cursor);
  return output.replace(/^\s+/, '').replace(/\n{3,}/g, '\n\n').trimEnd();
}

/** True when the text holds any reasoning tag at all — used by tests and the latency probe. */
export function hasThinking(text: string): boolean {
  return /<\s*\/?\s*think\s*>/i.test(text);
}
