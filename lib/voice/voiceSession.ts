/**
 * The one owner of a voice turn.
 *
 * Every question JARVIS answers is a turn with an id, an AbortSignal and a
 * deadline. Starting a new turn cancels the old one — its pending tools, its
 * generation and its queued speech — and every late result carries the id of
 * the turn that asked for it, so an answer from an abandoned turn can be
 * recognised and thrown away instead of being spoken over the new one.
 *
 * Rendering observes this; it never drives it. Pure TypeScript, no React, no
 * native imports: the race conditions are unit-tested off the phone.
 */

export type InteractionState =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'thinking'
  | 'speaking'
  | 'interrupted'
  | 'error';

export type Connectivity = 'online' | 'offline' | 'degraded';

export interface TurnContext {
  turnId: string;
  signal: AbortSignal;
  deadlineAt: number;
  locale: string;
  timezone: string;
}

export interface SessionSnapshot {
  state: InteractionState;
  turnId: string | null;
  connectivity: Connectivity;
}

/** Transitions the controller accepts; anything else is a bug and is ignored. */
const ALLOWED: Record<InteractionState, InteractionState[]> = {
  idle: ['listening', 'thinking', 'speaking', 'error'],
  listening: ['idle', 'transcribing', 'thinking', 'interrupted', 'error'],
  transcribing: ['idle', 'thinking', 'listening', 'interrupted', 'error'],
  thinking: ['speaking', 'idle', 'interrupted', 'error', 'listening'],
  speaking: ['idle', 'listening', 'interrupted', 'error', 'thinking'],
  interrupted: ['idle', 'listening', 'thinking', 'error'],
  error: ['idle', 'listening', 'thinking'],
};

export function canTransition(from: InteractionState, to: InteractionState): boolean {
  return from === to || ALLOWED[from].includes(to);
}

/** Per-turn bounds from the brief: 3 tool operations, 2 concurrent reads. */
export const MAX_TOOL_OPS = 3;
export const MAX_CONCURRENT_READS = 2;
export const DEFAULT_TURN_MS = 30_000;

export interface VoiceSessionOptions {
  now?: () => number;
  locale?: string;
  timezone?: string;
  idFactory?: () => string;
}

type Listener = (snapshot: SessionSnapshot) => void;

export class VoiceSessionController {
  private state: InteractionState = 'idle';
  private connectivity: Connectivity = 'online';
  private current: { ctx: TurnContext; abort: AbortController; toolOps: number; activeReads: number } | null = null;
  private listeners = new Set<Listener>();
  private counter = 0;
  private deadlineTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly now: () => number;
  private readonly idFactory: () => string;
  locale: string;
  timezone: string;

  constructor(options: VoiceSessionOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.locale = options.locale ?? 'en';
    this.timezone = options.timezone ?? 'Asia/Dubai';
    this.idFactory = options.idFactory ?? (() => `turn-${this.now().toString(36)}-${(this.counter += 1)}`);
  }

  snapshot(): SessionSnapshot {
    return { state: this.state, turnId: this.current?.ctx.turnId ?? null, connectivity: this.connectivity };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Accept a new user turn. The previous turn, if any, is aborted first:
   * its tools, generation and speech are all cancelled through its signal.
   */
  beginTurn(timeoutMs = DEFAULT_TURN_MS): TurnContext {
    if (this.current) this.cancel('superseded');
    const abort = new AbortController();
    const ctx: TurnContext = {
      turnId: this.idFactory(),
      signal: abort.signal,
      deadlineAt: this.now() + timeoutMs,
      locale: this.locale,
      timezone: this.timezone,
    };
    this.current = { ctx, abort, toolOps: 0, activeReads: 0 };
    this.deadlineTimer = setTimeout(() => {
      if (this.current?.ctx.turnId === ctx.turnId) this.cancel('deadline');
    }, Math.max(0, timeoutMs));
    // Node tests must not stay alive for an idle turn; React Native timers are numbers.
    (this.deadlineTimer as { unref?: () => void }).unref?.();
    this.setState('thinking');
    return ctx;
  }

  /** True only for the live turn, before its deadline and not cancelled. */
  isCurrent(turnId: string): boolean {
    const turn = this.current;
    return Boolean(turn && turn.ctx.turnId === turnId && !turn.abort.signal.aborted && this.now() < turn.ctx.deadlineAt);
  }

  /** Run `apply` only if the result still belongs to the live turn. Returns whether it ran. */
  deliver<T>(turnId: string, value: T, apply: (value: T) => void): boolean {
    if (!this.isCurrent(turnId)) return false;
    apply(value);
    return true;
  }

  /**
   * Reserve one tool operation for this turn. False once the turn has used
   * its three, or is no longer current — the caller must then not run it.
   */
  reserveTool(turnId: string): boolean {
    const turn = this.current;
    if (!turn || !this.isCurrent(turnId) || turn.toolOps >= MAX_TOOL_OPS) return false;
    turn.toolOps += 1;
    return true;
  }

  /** Acquire one actual network-read slot. Tool operations are reserved separately. */
  reserveRead(turnId: string): (() => void) | null {
    const turn = this.current;
    if (!turn || !this.isCurrent(turnId) || turn.activeReads >= MAX_CONCURRENT_READS) return null;
    turn.activeReads += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      turn.activeReads -= 1;
    };
  }

  /** Run a network read inside the turn's concurrency and op budget. */
  async read<T>(turnId: string, run: (signal: AbortSignal) => Promise<T>): Promise<T | null> {
    const turn = this.current;
    if (!turn || turn.activeReads >= MAX_CONCURRENT_READS || !this.reserveTool(turnId)) return null;
    turn.activeReads += 1;
    try {
      const value = await run(turn.abort.signal);
      return this.isCurrent(turnId) ? value : null;
    } finally {
      turn.activeReads -= 1;
    }
  }

  /** Move the live turn's visible state; ignored for obsolete turns and illegal moves. */
  mark(turnId: string, next: InteractionState): boolean {
    if (!this.isCurrent(turnId)) return false;
    return this.setState(next);
  }

  /** The turn finished normally. */
  endTurn(turnId: string, next: InteractionState = 'idle'): void {
    if (this.current?.ctx.turnId !== turnId) return;
    this.clearDeadline();
    this.current = null;
    this.setState(next);
  }

  /**
   * Stop everything for the live turn. `interrupted` is shown briefly by the
   * Core, then the caller moves on (to listening, or idle).
   */
  cancel(reason: 'user' | 'superseded' | 'deadline' | 'error' = 'user'): string | null {
    const turn = this.current;
    if (!turn) return null;
    this.clearDeadline();
    turn.abort.abort(reason);
    this.current = null;
    this.setState(reason === 'error' || reason === 'deadline' ? 'error' : 'interrupted');
    return turn.ctx.turnId;
  }

  /** Microphone states are outside a turn: the controller still owns them. */
  setListening(listening: boolean, transcribing = false): void {
    if (this.current) return;
    this.setState(listening ? (transcribing ? 'transcribing' : 'listening') : 'idle');
  }

  setSpeaking(speaking: boolean): void {
    if (speaking) this.setState('speaking');
    else if (this.state === 'speaking') this.setState('idle');
  }

  setConnectivity(next: Connectivity): void {
    if (next === this.connectivity) return;
    this.connectivity = next;
    this.emit();
  }

  private clearDeadline(): void {
    if (this.deadlineTimer !== null) clearTimeout(this.deadlineTimer);
    this.deadlineTimer = null;
  }

  private setState(next: InteractionState): boolean {
    if (!canTransition(this.state, next)) return false;
    if (next === this.state) return true;
    this.state = next;
    this.emit();
    return true;
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
