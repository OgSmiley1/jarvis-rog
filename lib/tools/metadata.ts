import type { ToolDefinition } from './types';
export interface ToolMetadata {
  network: boolean;
  permissions: readonly string[];
  localOnlyCompatible: boolean;
  timeoutMs: number;
  cancellation: 'abort-request' | 'discard-result';
  availability: 'local' | 'android' | 'optional-bridge' | 'provider';
}
const PERMISSIONS: Record<string, string[]> = {
  'phone.call': ['READ_CONTACTS (contact names only)'],
  'phone.text': ['READ_CONTACTS (contact names only)'],
  'phone.read_messages': ['READ_SMS'],
  'phone.recent_calls': ['READ_CALL_LOG'],
  'phone.calendar': ['READ_CALENDAR'],
  'vision.look': ['CAMERA'],
};
/** Enrich the one registry; no second set of execution handlers. */
export function toolMetadata(tool: ToolDefinition): ToolMetadata {
  const network = tool.name.startsWith('live.') || ['device.open_url', 'device.open_map_search', 'phone.web_search'].includes(tool.name);
  // Termux's authenticated bridge is bound to 127.0.0.1; its registered
  // handlers run on this phone. Internet operations need separate tool routes.
  const local = /^(?:utility\.(?:calculate|time)|local\.(?:qr|note_add|notes_read))$/.test(tool.name);
  return {
    network, permissions: PERMISSIONS[tool.name] ?? [], localOnlyCompatible: !network,
    timeoutMs: tool.name === 'vision.look' ? 60_000 : 20_000,
    cancellation: tool.name.startsWith('live.') ? 'abort-request' : 'discard-result',
    availability: tool.target === 'TERMUX' ? 'optional-bridge' : tool.name.startsWith('live.') ? 'provider' : local ? 'local' : 'android',
  };
}
