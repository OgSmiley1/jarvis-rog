/**
 * What each registered tool needs and what it really does (spec §D): the
 * Android permissions it uses, whether it touches the internet, its time
 * limit, and the honest outcome — "opens a screen" tools hand the last tap to
 * the owner (dialer, SMS, calendar), so JARVIS reports "opened", never "done".
 *
 * The router enforces `timeoutMs`; the registry test fails if a tool is added
 * without a profile, so this table cannot drift from the registry.
 */

export type ToolOutcome = 'opens-screen' | 'reads' | 'acts';

export interface ToolProfile {
  /** Android runtime permissions the tool relies on (empty: none). */
  permissions: readonly string[];
  /** Calls an online provider (refused in Local only and by the zero-cost policy). */
  network: boolean;
  /** Hard limit for one run, inside the turn's own deadline. */
  timeoutMs: number;
  outcome: ToolOutcome;
}

const INTENT: ToolProfile = { permissions: [], network: false, timeoutMs: 5_000, outcome: 'opens-screen' };
const LOCAL: ToolProfile = { permissions: [], network: false, timeoutMs: 3_000, outcome: 'acts' };
const READ_LOCAL: ToolProfile = { permissions: [], network: false, timeoutMs: 3_000, outcome: 'reads' };
// Live data: a 4 s request plus one retry fits; the turn deadline still caps it.
const LIVE: ToolProfile = { permissions: [], network: true, timeoutMs: 12_000, outcome: 'reads' };

export const TOOL_PROFILES: Record<string, ToolProfile> = {
  'device.open_map_search': INTENT,
  'device.compose_email': INTENT,
  'device.open_url': INTENT,
  'device.open_settings': INTENT,
  'device.open_camera': INTENT,
  'device.open_dialer': INTENT,
  'device.compose_sms': INTENT,
  'device.open_wifi_settings': INTENT,
  'device.settings_panel': INTENT,
  'assistant.speak': { ...LOCAL, timeoutMs: 30_000 },
  'assistant.stop_speaking': LOCAL,

  // Contacts are read to resolve a name; the owner taps Call / Send / Save.
  'phone.call': { ...INTENT, permissions: ['READ_CONTACTS'] },
  'phone.text': { ...INTENT, permissions: ['READ_CONTACTS'] },
  'phone.add_event': INTENT,
  'phone.read_messages': { ...READ_LOCAL, permissions: ['READ_SMS', 'READ_CONTACTS'], timeoutMs: 5_000 },
  'phone.recent_calls': { ...READ_LOCAL, permissions: ['READ_CALL_LOG', 'READ_CONTACTS'], timeoutMs: 5_000 },
  'phone.calendar': { ...READ_LOCAL, permissions: ['READ_CALENDAR'], timeoutMs: 5_000 },
  'phone.open_app': { ...INTENT, timeoutMs: 6_000 },
  'phone.web_search': INTENT,
  'phone.battery': READ_LOCAL,

  // The camera opens only inside the owner's own request; the brain describes it on the phone.
  'vision.look': { permissions: ['CAMERA'], network: false, timeoutMs: 60_000, outcome: 'reads' },

  'utility.time': READ_LOCAL,
  'utility.calculate': READ_LOCAL,
  'utility.system_status': READ_LOCAL,

  'live.weather': LIVE,
  'live.prayer': LIVE,
  'live.brief': LIVE,
  'live.quran': LIVE,
  'live.headlines': LIVE,
  'live.space_news': LIVE,
  'live.joke': LIVE,
  'live.quote': LIVE,
  'live.where_am_i': LIVE,

  // The Clock app's own timer and alarm screens: Android sets them, JARVIS asks.
  'local.timer': { ...INTENT, outcome: 'acts' },
  'local.alarm': { ...INTENT, outcome: 'acts' },
  'local.show_timers': INTENT,
  'local.qr': LOCAL,
  'local.note_add': LOCAL,
  'local.notes_read': READ_LOCAL,

  // The Termux bridge is 127.0.0.1 on the phone itself: not the internet.
  'termux.app_open': { ...INTENT, timeoutMs: 8_000 },
  'termux.system_status': { ...READ_LOCAL, timeoutMs: 8_000 },
  'termux.git_status': { ...READ_LOCAL, timeoutMs: 8_000 },
};

/** A tool without a profile is still bounded: the most conservative local limit. */
export function profileFor(tool: string): ToolProfile {
  return TOOL_PROFILES[tool] ?? { permissions: [], network: false, timeoutMs: 5_000, outcome: 'acts' };
}

