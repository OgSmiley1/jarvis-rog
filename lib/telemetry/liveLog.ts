/**
 * The live test log: what JARVIS heard, decided, said and failed at, in the
 * order it happened.
 *
 * It exists so a test on the phone can be followed off the phone. Recording is
 * in memory only and costs nothing; nothing leaves the device unless the owner
 * starts a live link or shares the log. Every event passes through `sanitize`
 * first, so an API key can never ride along in a payload.
 */

export type LiveEventKind =
  | 'app'
  | 'state'
  | 'heard'
  | 'wake'
  | 'ask'
  | 'answer'
  | 'speak'
  | 'halt'
  | 'brain'
  | 'voice'
  | 'error'
  | 'link';

export interface LiveEvent {
  seq: number;
  at: number;
  kind: LiveEventKind;
  message: string;
  data?: Record<string, string | number | boolean | null>;
}

type Listener = (event: LiveEvent) => void;

export const LIVE_LOG_CAPACITY = 400;
const MAX_TEXT = 400;

// Shapes of the credentials this app can hold, so one pasted or spoken by
// accident is scrubbed rather than posted.
const SECRET_PATTERNS: RegExp[] = [
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /gh[pousr]_[A-Za-z0-9]{20,}/g,
  /gsk_[A-Za-z0-9]{20,}/g,
  /csk-[A-Za-z0-9]{20,}/g,
  /sk-[A-Za-z0-9_-]{20,}/g,
  /AIza[A-Za-z0-9_-]{30,}/g,
  /hf_[A-Za-z0-9]{20,}/g,
];
const SECRET_KEY = /key|token|secret|password|authorization|cookie/i;

export function scrubText(text: string, max = MAX_TEXT): string {
  let clean = text;
  for (const pattern of SECRET_PATTERNS) clean = clean.replace(pattern, '[redacted]');
  clean = clean.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export function sanitize(data: Record<string, unknown> | undefined): LiveEvent['data'] {
  if (!data) return undefined;
  const out: NonNullable<LiveEvent['data']> = {};
  for (const [key, value] of Object.entries(data)) {
    if (SECRET_KEY.test(key)) {
      out[key] = '[redacted]';
    } else if (value === null || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    } else if (typeof value === 'string') {
      out[key] = scrubText(value);
    } else if (value !== undefined) {
      out[key] = scrubText(String(value));
    }
  }
  return out;
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

/** `22:10:03.120 HEARD  "jarvis what time is it" · lang=en` */
export function formatEvent(event: LiveEvent): string {
  const time = new Date(event.at);
  const stamp = `${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}.${pad(time.getMilliseconds(), 3)}`;
  const extras = event.data
    ? Object.entries(event.data)
        .map(([key, value]) => `${key}=${typeof value === 'string' && /\s/.test(value) ? JSON.stringify(value) : String(value)}`)
        .join(' ')
    : '';
  return `${stamp} ${event.kind.toUpperCase().padEnd(6)} ${event.message}${extras ? ` · ${extras}` : ''}`;
}

export class LiveLog {
  private events: LiveEvent[] = [];
  private listeners = new Set<Listener>();
  private seq = 0;

  constructor(
    private readonly now: () => number = Date.now,
    private readonly capacity = LIVE_LOG_CAPACITY,
  ) {}

  record(kind: LiveEventKind, message: string, data?: Record<string, unknown>): LiveEvent {
    const event: LiveEvent = { seq: (this.seq += 1), at: this.now(), kind, message: scrubText(message), data: sanitize(data) };
    this.events.push(event);
    if (this.events.length > this.capacity) this.events.splice(0, this.events.length - this.capacity);
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // A broken sink must never break the app it is observing.
      }
    }
    return event;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  snapshot(): LiveEvent[] {
    return [...this.events];
  }

  /** Plain text, oldest first — what "Share log" sends. */
  toText(): string {
    return this.events.map(formatEvent).join('\n');
  }

  clear(): void {
    this.events = [];
  }
}

/** The app-wide log every screen records into. */
export const liveLog = new LiveLog();

export function recordLive(kind: LiveEventKind, message: string, data?: Record<string, unknown>): void {
  liveLog.record(kind, message, data);
}
