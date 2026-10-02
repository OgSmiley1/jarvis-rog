import { describe, expect, it, vi } from 'vitest';
import { MAX_TOOL_OPS, VoiceSessionController, canTransition } from '@/lib/voice/voiceSession';
import { StageTimer, distribution, formatLatencyReport, latencyReport, percentile, recordTurn, resetLatency } from '@/lib/telemetry/stageTimer';

function controller(start = 0) {
  let now = start;
  let id = 0;
  const session = new VoiceSessionController({ now: () => now, idFactory: () => `t${(id += 1)}` });
  return { session, advance: (ms: number) => (now += ms) };
}

describe('VoiceSessionController', () => {
  it('a new turn cancels the old one and aborts its signal', () => {
    const { session } = controller();
    const first = session.beginTurn();
    const second = session.beginTurn();
    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);
    expect(session.isCurrent(first.turnId)).toBe(false);
    expect(session.isCurrent(second.turnId)).toBe(true);
  });

  it('discards a late result from an obsolete turn', () => {
    const { session } = controller();
    const old = session.beginTurn();
    session.beginTurn();
    const spoken: string[] = [];
    expect(session.deliver(old.turnId, 'stale answer', (v) => spoken.push(v))).toBe(false);
    expect(spoken).toEqual([]);
  });

  it('a result after the deadline is discarded', () => {
    const { session, advance } = controller();
    const turn = session.beginTurn(1_000);
    advance(1_001);
    expect(session.deliver(turn.turnId, 'late', () => undefined)).toBe(false);
  });

  it('touch cancel aborts and shows interrupted', () => {
    const { session } = controller();
    const turn = session.beginTurn();
    expect(session.cancel('user')).toBe(turn.turnId);
    expect(turn.signal.aborted).toBe(true);
    expect(session.snapshot().state).toBe('interrupted');
  });

  it('caps a turn at three tool operations', () => {
    const { session } = controller();
    const turn = session.beginTurn();
    const granted = Array.from({ length: MAX_TOOL_OPS + 2 }, () => session.reserveTool(turn.turnId));
    expect(granted.filter(Boolean)).toHaveLength(MAX_TOOL_OPS);
  });

  it('allows two concurrent reads, refuses a third while they run', async () => {
    const { session } = controller();
    const turn = session.beginTurn();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const a = session.read(turn.turnId, async () => { await gate; return 'a'; });
    const b = session.read(turn.turnId, async () => { await gate; return 'b'; });
    const c = await session.read(turn.turnId, async () => 'c');
    expect(c).toBeNull();
    release();
    expect(await a).toBe('a');
    expect(await b).toBe('b');
  });

  it('a read that finishes after the turn was replaced returns null', async () => {
    const { session } = controller();
    const turn = session.beginTurn();
    const pending = session.read(turn.turnId, async () => {
      await Promise.resolve();
      return 'weather';
    });
    session.beginTurn();
    expect(await pending).toBeNull();
  });

  it('marks from obsolete turns do not move the state', () => {
    const { session } = controller();
    const old = session.beginTurn();
    const live = session.beginTurn();
    expect(session.mark(old.turnId, 'speaking')).toBe(false);
    expect(session.mark(live.turnId, 'speaking')).toBe(true);
    expect(session.snapshot().state).toBe('speaking');
  });

  it('connectivity is independent of interaction state', () => {
    const { session } = controller();
    const turn = session.beginTurn();
    session.mark(turn.turnId, 'speaking');
    session.setConnectivity('offline');
    expect(session.snapshot()).toMatchObject({ state: 'speaking', connectivity: 'offline' });
  });

  it('rejects illegal transitions', () => {
    expect(canTransition('idle', 'interrupted')).toBe(false);
    expect(canTransition('speaking', 'interrupted')).toBe(true);
  });

  it('notifies subscribers once per change', () => {
    const { session } = controller();
    const seen: string[] = [];
    session.subscribe((s) => seen.push(s.state));
    const turn = session.beginTurn();
    session.mark(turn.turnId, 'thinking');
    session.endTurn(turn.turnId);
    expect(seen).toEqual(['thinking', 'idle']);
  });
});

describe('stage timer', () => {
  it('measures end of speech to first audio, first mark wins', () => {
    let t = 0;
    const timer = new StageTimer(() => t);
    timer.mark('speechEnd');
    t = 120;
    timer.mark('dispatch');
    t = 900;
    timer.mark('firstAudio');
    t = 5_000;
    timer.mark('firstAudio');
    expect(timer.summary().endToFirstAudio).toBe(900);
    expect(timer.summary().endToDispatch).toBe(120);
  });

  it('percentiles use nearest rank', () => {
    const values = Array.from({ length: 20 }, (_, i) => (i + 1) * 10);
    expect(percentile(values, 50)).toBe(100);
    expect(percentile(values, 95)).toBe(190);
    expect(distribution([])).toEqual({ n: 0, median: null, p95: null });
  });

  it('aggregates by scenario and flags too-few runs', () => {
    resetLatency();
    for (let i = 0; i < 3; i += 1) {
      let t = 0;
      const timer = new StageTimer(() => t);
      timer.scenario = 'local-command';
      timer.mark('speechEnd');
      t = 400 + i * 100;
      timer.mark('firstAudio');
      recordTurn(timer);
    }
    const [row] = latencyReport();
    expect(row).toMatchObject({ scenario: 'local-command|warm|en', n: 3, median: 500, enough: false });
    expect(formatLatencyReport()).toContain('need 30');
  });
});


it('actively aborts a stuck turn at its deadline without waiting for a result', () => {
  vi.useFakeTimers();
  try {
    const session = new VoiceSessionController();
    const turn = session.beginTurn(100);
    vi.advanceTimersByTime(100);
    expect(turn.signal.aborted).toBe(true);
    expect(session.snapshot()).toMatchObject({ turnId: null, state: 'error' });
  } finally { vi.useRealTimers(); }
});

it('clears deadline timers when a turn finishes or is superseded', () => {
  vi.useFakeTimers();
  try {
    const session = new VoiceSessionController();
    const first = session.beginTurn(100);
    session.endTurn(first.turnId);
    expect(vi.getTimerCount()).toBe(0);
    session.beginTurn(100);
    const latest = session.beginTurn(1000);
    vi.advanceTimersByTime(200);
    expect(latest.signal.aborted).toBe(false);
    session.endTurn(latest.turnId);
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});
