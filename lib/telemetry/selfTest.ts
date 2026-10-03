import { CORE_PRESETS } from '@/lib/core/CorePresets';
import { FALLBACK_LOOKS } from '@/lib/core/fallbackCore';
import { checkProvider } from '@/lib/net/providerPolicy';
import { routeDeterministicTool } from '@/lib/tools/deterministicRouter';
import { followUpCommand, nextLiveContext } from '@/lib/tools/liveRoutes';
import { listToolNames, toolCallGrammar, toolRegistry } from '@/lib/tools/registry';
import { createThinkFilter } from '@/lib/voice/stripThinking';

/**
 * The one-tap self-test in Diagnostics. Every check runs the real code the
 * app uses — the same router, policy, registry and presets — not a copy, so a
 * PASS here means that path works in this build on this phone. What it cannot
 * prove (the microphone, a spoken reply, a model's answer) it says so.
 */

export interface SelfTestResult {
  name: string;
  ok: boolean;
  detail: string;
}

export interface DeviceProbe {
  /** The brain runtime status: 'ready', 'loading', 'unloaded', 'error'… */
  modelStatus: string;
  /** A brain file was found in Download/JARVIS (or the configured path). */
  brainFound: boolean;
  connectivity: 'online' | 'offline' | 'degraded';
  localOnly: boolean;
}

function check(name: string, run: () => string | true): SelfTestResult {
  try {
    const out = run();
    return { name, ok: true, detail: out === true ? 'ok' : out };
  } catch (error) {
    return { name, ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function routed(text: string): string | undefined {
  return routeDeterministicTool(text)?.call.tool;
}

export function runSelfTest(device: DeviceProbe): SelfTestResult[] {
  return [
    check('Core', () => {
      const states = Object.keys(CORE_PRESETS);
      for (const [state, params] of Object.entries(CORE_PRESETS)) {
        for (const [key, value] of Object.entries(params)) expect(Number.isFinite(value), `${state}.${key} is not a number`);
      }
      expect(Object.keys(FALLBACK_LOOKS).length > 0, 'no fallback Core');
      return `${states.length} states, fallback Core ready`;
    }),

    check('Tools', () => {
      const names = listToolNames();
      expect(new Set(names).size === names.length, 'duplicate tool name');
      for (const tool of toolRegistry.values()) {
        expect(tool.description.trim().length > 0, `${tool.name} has no description`);
        expect(typeof tool.schema.safeParse === 'function', `${tool.name} has no schema`);
        expect(typeof tool.execute === 'function', `${tool.name} has no handler`);
      }
      expect(toolCallGrammar().length > 0, 'tool grammar is empty');
      return `${names.length} registered, each with a schema and handler`;
    }),

    check('Routing', () => {
      expect(routed('what is the weather in Dubai') === 'live.weather', 'weather question not routed to weather');
      expect(routed('set a timer for 5 minutes') === 'local.timer', 'timer not routed');
      expect(routed('open settings') === 'device.open_settings', 'open settings not routed');
      return 'weather, timer and settings reach their tools';
    }),

    check('Follow-ups', () => {
      const weather = nextLiveContext(null, routeDeterministicTool('weather in Ajman')?.call ?? null);
      expect(weather?.tool === 'live.weather', 'weather context not kept');
      const tomorrow = routeDeterministicTool(followUpCommand('and tomorrow?', weather) ?? '');
      expect(tomorrow?.call.tool === 'live.weather' && tomorrow.call.arguments.day === 'tomorrow', '"and tomorrow?" lost the weather');
      const prayer = nextLiveContext(null, routeDeterministicTool('prayer times in Ajman')?.call ?? null);
      const dubai = routeDeterministicTool(followUpCommand('what about Dubai?', prayer) ?? '');
      expect(dubai?.call.tool === 'live.prayer', '"what about Dubai?" lost the prayer times');
      expect(nextLiveContext(weather, routeDeterministicTool('open settings')?.call ?? null) === null, 'topic change did not clear');
      return 'tomorrow and another city stay on the last tool';
    }),

    check('Internet policy', () => {
      expect(!checkProvider('libretranslate', { strict: true }).allowed, 'unknown provider allowed');
      expect(!checkProvider('open-meteo', { strict: true, localOnly: true }).allowed, 'Local only did not block');
      expect(checkProvider('open-meteo', { strict: true }).allowed, 'free weather refused');
      return device.localOnly ? 'Local only is ON — nothing leaves the phone' : 'free services only; unknown and paid refused';
    }),

    check('Reasoning hidden', () => {
      const filter = createThinkFilter();
      const out = ['<th', 'ink>secret</think>', 'Ready.'].map((t) => filter.push(t)).join('') + filter.end();
      expect(out === 'Ready.', 'reasoning would be spoken');
      return 'never spoken or shown';
    }),

    {
      name: 'Brain',
      ok: device.modelStatus === 'ready' || device.modelStatus === 'loading',
      detail:
        device.modelStatus === 'ready'
          ? 'loaded — offline ready'
          : device.modelStatus === 'loading'
            ? 'loading…'
            : device.brainFound
              ? `found but ${device.modelStatus} — open the menu and load it`
              : 'no brain file in Download/JARVIS/models — run the setup command',
    },
    {
      name: 'Network',
      ok: true,
      detail: device.localOnly ? 'not used (Local only)' : device.connectivity,
    },
    {
      name: 'Not covered here',
      ok: true,
      detail: 'microphone, spoken reply and model answers — try them by voice',
    },
  ];
}
