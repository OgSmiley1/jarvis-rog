/**
 * What the live test log may say about the owner's words.
 *
 * The live channel is a public repository, and free speech can contain
 * anything — a number, a name, a dictated message — so no keyword filter is
 * trusted to catch it. By default the log records only the *shape* of what
 * was said (how many words); the words themselves are included only while the
 * owner has switched "include what I say" on, and that switch expires by
 * itself so it can never be left on and forgotten.
 */

export const TRANSCRIPT_OPT_IN_MS = 30 * 60_000;

export function transcriptsAllowed(until: number | undefined, now: number): boolean {
  return typeof until === 'number' && until > now;
}

export function liveText(text: string, until: number | undefined, now: number): string {
  if (transcriptsAllowed(until, now)) return text;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return `[${words} ${words === 1 ? 'word' : 'words'}]`;
}
