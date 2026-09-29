/**
 * Where a voice turn's time goes. The app records one TurnTiming per turn
 * (epoch milliseconds); `stages` turns it into the table the owner and
 * scripts/measure-voice-latency.mjs read. No imports: it runs under plain Node.
 *
 *   heard ──► asked ──► first token ──► first audio ──► end
 *   (STT final)  (send)     (model)        (voice starts)
 */

export interface TurnTiming {
  /** When the last finalized words arrived from speech recognition. Absent for typed turns. */
  heardAt?: number;
  askedAt: number;
  firstTokenAt?: number;
  /** When the voice actually started speaking this answer. */
  firstAudioAt?: number;
  endedAt?: number;
  /** 'local' | 'tool' | 'cloud' — which path answered. */
  route?: string;
}

export interface Stages {
  /** STT final → send. */
  heardToAskMs?: number;
  /** Send → first model token. */
  firstTokenMs?: number;
  /** Send → first audio: the number the owner feels. */
  firstAudioMs?: number;
  /** Heard (or send, for typed turns) → first audio. */
  userWaitMs?: number;
  totalMs?: number;
}

const diff = (to?: number, from?: number) => (typeof to === 'number' && typeof from === 'number' ? Math.max(0, to - from) : undefined);

export function stages(turn: TurnTiming): Stages {
  return {
    heardToAskMs: diff(turn.askedAt, turn.heardAt),
    firstTokenMs: diff(turn.firstTokenAt, turn.askedAt),
    firstAudioMs: diff(turn.firstAudioAt, turn.askedAt),
    userWaitMs: diff(turn.firstAudioAt, turn.heardAt ?? turn.askedAt),
    totalMs: diff(turn.endedAt, turn.askedAt),
  };
}

/** The target from the build pack: a short answer starts speaking within 5 s. */
export const FIRST_AUDIO_TARGET_MS = 5000;

function percentile(values: number[], p: number): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

export interface LatencySummary {
  turns: number;
  spoken: number;
  p50UserWaitMs?: number;
  p95UserWaitMs?: number;
  p50FirstTokenMs?: number;
  withinTarget: number;
  pass: boolean;
}

export function summarize(turns: TurnTiming[]): LatencySummary {
  const table = turns.map(stages);
  const waits = table.map((row) => row.userWaitMs).filter((value): value is number => typeof value === 'number');
  const firsts = table.map((row) => row.firstTokenMs).filter((value): value is number => typeof value === 'number');
  const withinTarget = waits.filter((value) => value < FIRST_AUDIO_TARGET_MS).length;
  const p95 = percentile(waits, 95);
  return {
    turns: turns.length,
    spoken: waits.length,
    p50UserWaitMs: percentile(waits, 50),
    p95UserWaitMs: p95,
    p50FirstTokenMs: percentile(firsts, 50),
    withinTarget,
    pass: waits.length > 0 && typeof p95 === 'number' && p95 < FIRST_AUDIO_TARGET_MS,
  };
}

/** The last turns this app session, for "Share voice timings". In memory only. */
const recent: TurnTiming[] = [];
export function recordTurn(turn: TurnTiming): void {
  recent.push(turn);
  if (recent.length > 30) recent.splice(0, recent.length - 30);
}
export function recentTurns(): TurnTiming[] {
  return [...recent];
}
