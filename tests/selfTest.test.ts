import { describe, expect, it } from 'vitest';
import { runSelfTest } from '@/lib/telemetry/selfTest';
import { checkProvider } from '@/lib/net/providerPolicy';
import { cloudPlan } from '@/lib/online/cloudPlan';
import { followUpCommand, nextLiveContext } from '@/lib/tools/liveRoutes';
import { routeDeterministicTool } from '@/lib/tools/deterministicRouter';

const device = { modelStatus: 'ready', brainFound: true, connectivity: 'online' as const, localOnly: false };

describe('one-tap self-test', () => {
  it('every built-in check passes on this build', () => {
    const failed = runSelfTest(device).filter((r) => !r.ok);
    expect(failed).toEqual([]);
  });

  it('says plainly when the brain is missing or not loaded', () => {
    const missing = runSelfTest({ ...device, modelStatus: 'unloaded', brainFound: false }).find((r) => r.name === 'Brain')!;
    expect(missing.ok).toBe(false);
    expect(missing.detail).toMatch(/setup command/);
    const found = runSelfTest({ ...device, modelStatus: 'error', brainFound: true }).find((r) => r.name === 'Brain')!;
    expect(found.detail).toMatch(/found but error/);
  });
});

describe('Local only', () => {
  it('refuses every online provider and keeps the cloud brain off', () => {
    for (const id of ['open-meteo', 'aladhan', 'groq', 'cerebras']) {
      expect(checkProvider(id, { strict: true, localOnly: true }).allowed).toBe(false);
    }
    expect(cloudPlan({ cloudEnabled: true, localReady: false, cloudFirst: true, localOnly: true })).toBe('local');
    expect(cloudPlan({ cloudEnabled: true, localReady: false, cloudFirst: false })).toBe('cloud-only');
  });
});

describe('follow-up context', () => {
  const ctx = (text: string, prev = null as ReturnType<typeof nextLiveContext>) => nextLiveContext(prev, routeDeterministicTool(text)?.call ?? null);

  it('a city follow-up after "tomorrow" keeps tomorrow', () => {
    const tomorrow = ctx('weather in Ajman tomorrow');
    expect(tomorrow).toMatchObject({ tool: 'live.weather', tomorrow: true });
    const dubai = routeDeterministicTool(followUpCommand('what about Dubai?', tomorrow)!);
    expect(dubai?.call).toMatchObject({ tool: 'live.weather', arguments: { city: 'dubai', day: 'tomorrow' } });
  });

  it('another topic clears the context', () => {
    const weather = ctx('weather in Ajman');
    expect(weather).not.toBeNull();
    expect(nextLiveContext(weather, routeDeterministicTool('set a timer for 5 minutes')?.call ?? null)).toBeNull();
    expect(nextLiveContext(weather, null)).toBeNull();
  });
});

import { listToolNames } from '@/lib/tools/registry';
import { TOOL_PROFILES } from '@/lib/tools/toolProfiles';
import { executeTool } from '@/lib/tools/router';
import { vi } from 'vitest';

describe('tool profiles (spec §D)', () => {
  it('every registered tool declares permissions, network use, a time limit and its outcome', () => {
    const missing = listToolNames().filter((name) => !TOOL_PROFILES[name]);
    expect(missing).toEqual([]);
    const stale = Object.keys(TOOL_PROFILES).filter((name) => !listToolNames().includes(name));
    expect(stale).toEqual([]);
  });

  it('only live.* tools use the internet; dialer and SMS only open a screen', () => {
    for (const [name, profile] of Object.entries(TOOL_PROFILES)) expect(profile.network).toBe(name.startsWith('live.'));
    expect(TOOL_PROFILES['phone.call']!.outcome).toBe('opens-screen');
    expect(TOOL_PROFILES['phone.text']!.outcome).toBe('opens-screen');
  });

  it('the router stops a tool that runs past its limit', async () => {
    vi.useFakeTimers();
    try {
      const { toolRegistry } = await import('@/lib/tools/registry');
      const tool = toolRegistry.get('local.notes_read')!;
      const original = tool.execute;
      tool.execute = () => new Promise(() => undefined);
      const pending = executeTool({ id: 't', tool: 'local.notes_read', arguments: {} });
      await vi.advanceTimersByTimeAsync(TOOL_PROFILES['local.notes_read']!.timeoutMs + 1);
      const result = await pending;
      tool.execute = original;
      expect(result).toMatchObject({ ok: false, error: 'TOOL_TIMEOUT' });
    } finally {
      vi.useRealTimers();
    }
  });
});
