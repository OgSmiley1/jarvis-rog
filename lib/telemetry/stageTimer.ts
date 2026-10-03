/**
 * Stage timings for one turn, and the running aggregate the owner can read.
 *
 * Timestamps come from a monotonic clock (performance.now where it exists) so
 * a clock change mid-turn cannot produce a negative or inflated figure. Only
 * durations are kept — never what was said — and the aggregate reports
 * median, p95 and the sample count, because a single fast run proves nothing.
 */

export type Stage =
  | 'wake'
  | 'speechEnd'
  | 'transcriptFinal'
  | 'dispatch'
  | 'toolStart'
  | 'toolEnd'
  | 'modelStart'
  | 'firstToken'
  | 'modelEnd'
  | 'ttsQueued'
  | 'firstAudio'
  | 'turnEnd';

export type Scenario = 'local-command' | 'live-data-cached' | 'live-data-network' | 'conversation' | 'cloud';

const monotonic = (): number => {
  const perf = (globalThis as { performance?: { now?: () => number } }).performance;
  return typeof perf?.now === 'function' ? perf.now() : Date.now();
};

export class StageTimer {
  private readonly marks = new Map<Stage, number>();
  scenario: Scenario = 'conversation';
  language: 'en' | 'ar' = 'en';
  warm = true;

  constructor(private readonly clock: () => number = monotonic) {}

  /** First mark of a stage wins: a later duplicate cannot move it. */
  mark(stage: Stage, at = this.clock()): void {
    if (!this.marks.has(stage)) this.marks.set(stage, at);
  }

  has(stage: Stage): boolean {
    return this.marks.has(stage);
  }

  /** Milliseconds between two stages, or null when either was not reached. */
  between(from: Stage, to: Stage): number | null {
    const a = this.marks.get(from);
    const b = this.marks.get(to);
    return a === undefined || b === undefined ? null : Math.max(0, Math.round(b - a));
  }

  /** The turn's key durations, named for the live log and the aggregate. */
  summary(): Record<string, number | null> {
    const origin: Stage = this.marks.has('speechEnd') ? 'speechEnd' : 'dispatch';
    return {
      endToFirstAudio: this.between(origin, 'firstAudio'),
      endToDispatch: this.between(origin, 'dispatch'),
      firstToken: this.between('modelStart', 'firstToken'),
      tool: this.between('toolStart', 'toolEnd'),
      queuedToAudio: this.between('ttsQueued', 'firstAudio'),
      turn: this.between(origin, 'turnEnd'),
    };
  }
}

export interface Distribution {
  n: number;
  median: number | null;
  p95: number | null;
}

/** Nearest-rank percentile; stable and easy to reproduce by hand. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1] ?? null;
}

export function distribution(values: number[]): Distribution {
  return { n: values.length, median: percentile(values, 50), p95: percentile(values, 95) };
}

/** The brief asks for ≥30 runs before a latency figure counts. */
export const MIN_RUNS = 30;

const MAX_SAMPLES = 500;
const samples = new Map<string, number[]>();

function key(scenario: Scenario, warm: boolean, language: string): string {
  return `${scenario}|${warm ? 'warm' : 'cold'}|${language}`;
}

/** Store a finished turn's end-of-speech → first-audio time under its scenario. */
export function recordTurn(timer: StageTimer): void {
  const value = timer.summary().endToFirstAudio;
  if (value === null || value === undefined) return;
  const bucket = key(timer.scenario, timer.warm, timer.language);
  const list = samples.get(bucket) ?? [];
  list.push(value);
  if (list.length > MAX_SAMPLES) list.shift();
  samples.set(bucket, list);
}

export interface ScenarioReport extends Distribution {
  scenario: string;
  enough: boolean;
}

export function latencyReport(): ScenarioReport[] {
  return [...samples.entries()].map(([scenario, values]) => ({
    scenario,
    ...distribution(values),
    enough: values.length >= MIN_RUNS,
  }));
}

export function resetLatency(): void {
  samples.clear();
}

/** One line per scenario, for the settings sheet and the live log. */
export function formatLatencyReport(report = latencyReport()): string {
  if (report.length === 0) return 'No turns measured yet.';
  return report
    .map((row) => `${row.scenario}: median ${row.median} ms · p95 ${row.p95} ms · n=${row.n}${row.enough ? '' : ` (need ${MIN_RUNS})`}`)
    .join('\n');
}
