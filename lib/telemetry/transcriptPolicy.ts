/**
 * What the live test log may say about the owner's words.
 *
 * Free speech can contain anything — a number, a name, a dictated message —
 * so no keyword filter is trusted to catch it. By default the log records only
 * the *shape* of what was said (how many words). The words themselves are
 * recorded only while BOTH hold: the owner has switched "include what I say"
 * on (it expires by itself), and a live link is running to a repository
 * GitHub has confirmed is private. A public channel never receives words.
 */

export const TRANSCRIPT_OPT_IN_MS = 30 * 60_000;

export function transcriptsAllowed(until: number | undefined, now: number): boolean {
  return typeof until === 'number' && until > now;
}

let privateChannelLive = false;

/** Set by the live session: true only while a link to a confirmed-private repository runs. */
export function setPrivateChannelLive(value: boolean): void {
  privateChannelLive = value;
}

export function privateChannelIsLive(): boolean {
  return privateChannelLive;
}

/** Kinds whose message can carry the owner's or JARVIS's words. */
export const WORD_KINDS = new Set(['heard', 'ask', 'answer', 'speak', 'wake']);

/** A logged line that holds words rather than a count or a fixed label. */
export function carriesWords(event: { kind: string; message: string; data?: Record<string, unknown> }): boolean {
  if (!WORD_KINDS.has(event.kind)) return false;
  if (event.kind === 'wake') return typeof event.data?.command === 'string' && !/^\[\d+ words?\]$/.test(event.data.command);
  return !/^\[[^\]]*\]$/.test(event.message) && !/^(?:speaking|silent)$/.test(event.message);
}

export function liveText(text: string, until: number | undefined, now: number): string {
  if (privateChannelLive && transcriptsAllowed(until, now)) return text;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return `[${words} ${words === 1 ? 'word' : 'words'}]`;
}
