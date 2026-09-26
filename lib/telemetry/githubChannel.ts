import { formatEvent, type LiveEvent } from '@/lib/telemetry/liveLog';

/**
 * Streams the live test log to a GitHub issue (or pull request) as comments,
 * so a test on the phone can be followed from Claude while it happens.
 *
 * Why GitHub: it is the one service both the phone and the Claude session can
 * reach, it costs nothing, and a comment on a subscribed pull request wakes a
 * watching Claude session by itself — no polling. The channel belongs in a
 * PRIVATE repository, because what the owner says to JARVIS is in the log.
 *
 * Batching is deliberate. GitHub asks integrations to stay under roughly 80
 * content-creating requests a minute and 500 an hour; one comment per event
 * would break that in a busy minute. Events are grouped, posts are at least
 * `minIntervalMs` apart, and a session ends itself after `maxDurationMs`, so
 * the worst case is ~225 comments — well inside the limit.
 */

export interface ChannelResponse {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  headers?: { get: (name: string) => string | null };
}

export type ChannelFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<ChannelResponse>;

export interface ChannelTarget {
  owner: string;
  repo: string;
  /**
   * An existing issue or pull request to post into. Omitted: each session
   * opens its own issue, titled with the time it started.
   */
  number?: number;
}

export type ChannelState = 'idle' | 'connecting' | 'live' | 'backoff' | 'stopped' | 'error';

export interface ChannelStatus {
  state: ChannelState;
  /** Web address of the issue or PR being written to. */
  url?: string;
  number?: number;
  posted: number;
  pending: number;
  dropped: number;
  error?: string;
  startedAt?: number;
}

export interface ChannelOptions {
  target: ChannelTarget;
  token: string;
  fetchImpl: ChannelFetch;
  /** One line identifying the device and build, put on every comment. */
  header: string;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  minIntervalMs?: number;
  idleMs?: number;
  maxDurationMs?: number;
  maxBufferedLines?: number;
}

export const COMMENT_BUDGET = 60_000; // GitHub's hard limit is 65,536 characters.
const API = 'https://api.github.com';

/** Keeps a spoken ``` from closing the code block the log is posted in. */
export function fenceSafe(line: string): string {
  return line.replace(/```/g, "'''");
}

/** Splits lines into comment bodies that each fit GitHub's size limit. */
export function takeBatch(lines: string[], budget = COMMENT_BUDGET): { batch: string[]; rest: string[] } {
  const batch: string[] = [];
  let size = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!.length > budget ? `${lines[index]!.slice(0, budget - 1)}…` : lines[index]!;
    if (batch.length > 0 && size + line.length + 1 > budget) return { batch, rest: lines.slice(index) };
    batch.push(line);
    size += line.length + 1;
  }
  return { batch, rest: [] };
}

export function renderComment(header: string, sessionId: string, batchNumber: number, lines: string[]): string {
  return [`\`JARVIS live\` · session ${sessionId} · #${batchNumber} · ${header}`, '```text', ...lines.map(fenceSafe), '```'].join('\n');
}

/** Human wording for a GitHub refusal: what is wrong and what fixes it. */
export function describeRefusal(status: number, target: ChannelTarget): string {
  const where = `${target.owner}/${target.repo}`;
  if (status === 401) return 'GitHub rejected the token — it is wrong, expired or revoked. Paste a new one.';
  if (status === 403 || status === 404) {
    return `The token cannot write to ${where}${target.number ? ` #${target.number}` : ''}. Give it Issues: Read and write (and Pull requests: Read and write for a PR channel) on that repository.`;
  }
  if (status === 410) return `Issues are turned off in ${where}. Turn them on in the repository settings.`;
  if (status === 422) return 'GitHub refused the comment as invalid.';
  return `GitHub answered ${status}.`;
}

function retryDelayMs(response: ChannelResponse, now: number): number | undefined {
  const retryAfter = Number(response.headers?.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
  if (response.headers?.get('x-ratelimit-remaining') === '0') {
    const reset = Number(response.headers.get('x-ratelimit-reset'));
    if (Number.isFinite(reset) && reset > 0) return Math.max(1000, reset * 1000 - now);
    return 60_000;
  }
  return response.status === 429 ? 60_000 : undefined;
}

export class GithubLiveChannel {
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly minIntervalMs: number;
  private readonly idleMs: number;
  private readonly maxDurationMs: number;
  private readonly maxBufferedLines: number;
  private readonly sessionId: string;

  private lines: string[] = [];
  private flushTimer: unknown;
  private endTimer: unknown;
  private lastPostAt = 0;
  private backoffUntil = 0;
  private flushing = false;
  private batchNumber = 0;
  private listeners = new Set<(status: ChannelStatus) => void>();
  private current: ChannelStatus = { state: 'idle', posted: 0, pending: 0, dropped: 0 };

  constructor(private readonly options: ChannelOptions) {
    this.now = options.now ?? Date.now;
    this.setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    this.minIntervalMs = options.minIntervalMs ?? 8_000;
    this.idleMs = options.idleMs ?? 1_500;
    this.maxDurationMs = options.maxDurationMs ?? 30 * 60_000;
    this.maxBufferedLines = options.maxBufferedLines ?? 400;
    this.sessionId = this.now().toString(36).slice(-6);
  }

  get status(): ChannelStatus {
    return this.current;
  }

  onStatus(listener: (status: ChannelStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private update(patch: Partial<ChannelStatus>): void {
    this.current = { ...this.current, ...patch, pending: this.lines.length };
    for (const listener of this.listeners) listener(this.current);
  }

  private headers(): Record<string, string> {
    return {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${this.options.token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }

  /**
   * Proves the token can write before anything is buffered for it: opens the
   * session's issue, or reads the configured one.
   */
  async start(): Promise<ChannelStatus> {
    const { target } = this.options;
    this.update({ state: 'connecting', error: undefined, startedAt: this.now() });
    try {
      let response: ChannelResponse;
      if (target.number) {
        response = await this.options.fetchImpl(`${API}/repos/${target.owner}/${target.repo}/issues/${target.number}`, {
          method: 'GET',
          headers: this.headers(),
        });
      } else {
        const started = new Date(this.now()).toISOString().replace('T', ' ').slice(0, 16);
        response = await this.options.fetchImpl(`${API}/repos/${target.owner}/${target.repo}/issues`, {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify({
            title: `JARVIS live test · ${started} UTC · session ${this.sessionId}`,
            body: `Live test log from the phone. ${this.options.header}\n\nEach comment below is one batch of events, oldest first.`,
          }),
        });
      }
      if (!response.ok) {
        this.update({ state: 'error', error: describeRefusal(response.status, target) });
        return this.current;
      }
      const issue = JSON.parse(await response.text()) as { number?: number; html_url?: string };
      this.update({ state: 'live', number: issue.number ?? target.number, url: issue.html_url });
      this.endTimer = this.setTimer(() => void this.stop('the 30-minute session limit was reached'), this.maxDurationMs);
      return this.current;
    } catch (error) {
      this.update({ state: 'error', error: `Could not reach GitHub: ${error instanceof Error ? error.message : String(error)}` });
      return this.current;
    }
  }

  push(event: LiveEvent): void {
    if (this.current.state !== 'live' && this.current.state !== 'backoff' && this.current.state !== 'connecting') return;
    this.lines.push(formatEvent(event));
    if (this.lines.length > this.maxBufferedLines) {
      const overflow = this.lines.length - this.maxBufferedLines;
      this.lines.splice(0, overflow);
      this.update({ dropped: this.current.dropped + overflow });
    } else {
      this.update({});
    }
    this.schedule();
  }

  private schedule(delayOverride?: number): void {
    if (this.flushTimer !== undefined || this.lines.length === 0) return;
    if (this.current.state !== 'live' && this.current.state !== 'backoff') return;
    const now = this.now();
    const delay = delayOverride ?? Math.max(this.idleMs, this.lastPostAt + this.minIntervalMs - now, this.backoffUntil - now);
    this.flushTimer = this.setTimer(() => {
      this.flushTimer = undefined;
      void this.flush();
    }, delay);
  }

  /** Posts what is buffered as one comment. Resolves once the post settles. */
  async flush(): Promise<void> {
    if (this.flushing || this.lines.length === 0 || this.current.number === undefined) return;
    if (this.current.state !== 'live' && this.current.state !== 'backoff' && this.current.state !== 'stopped') return;
    this.flushing = true;
    const { batch, rest } = takeBatch(this.lines);
    this.lines = rest;
    const { target } = this.options;
    const nextBatch = this.batchNumber + 1;
    try {
      const response = await this.options.fetchImpl(
        `${API}/repos/${target.owner}/${target.repo}/issues/${this.current.number}/comments`,
        { method: 'POST', headers: this.headers(), body: JSON.stringify({ body: renderComment(this.options.header, this.sessionId, nextBatch, batch) }) },
      );
      if (response.ok) {
        this.batchNumber = nextBatch;
        this.lastPostAt = this.now();
        if (this.current.state === 'backoff') this.update({ state: 'live', error: undefined });
        this.update({ posted: this.current.posted + 1 });
      } else {
        const wait = retryDelayMs(response, this.now());
        this.lines = [...batch, ...this.lines];
        if (wait !== undefined) {
          this.backoffUntil = this.now() + wait;
          if (this.current.state !== 'stopped') this.update({ state: 'backoff', error: `GitHub asked to slow down; retrying in ${Math.ceil(wait / 1000)} s.` });
        } else {
          this.update({ state: 'error', error: describeRefusal(response.status, target) });
          this.cancelTimers();
        }
      }
    } catch (error) {
      // Offline for a moment: keep the lines and try again shortly.
      this.lines = [...batch, ...this.lines];
      this.backoffUntil = this.now() + 15_000;
      if (this.current.state !== 'stopped') {
        this.update({ state: 'backoff', error: `Network: ${error instanceof Error ? error.message : String(error)}; retrying.` });
      }
    } finally {
      this.flushing = false;
      this.update({});
    }
    this.schedule();
  }

  private cancelTimers(): void {
    if (this.flushTimer !== undefined) this.clearTimer(this.flushTimer);
    if (this.endTimer !== undefined) this.clearTimer(this.endTimer);
    this.flushTimer = undefined;
    this.endTimer = undefined;
  }

  /** Ends the session, posting whatever is still buffered once. */
  async stop(reason = 'stopped by the owner'): Promise<void> {
    if (this.current.state === 'stopped' || this.current.state === 'idle') return;
    const wasPosting = this.current.state === 'live' || this.current.state === 'backoff';
    this.cancelTimers();
    this.update({ state: 'stopped' });
    if (!wasPosting) return;
    this.lines.push(`— live link ended: ${reason}`);
    await this.flush();
  }
}
