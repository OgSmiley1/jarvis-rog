import type { JarvisToolCall } from './types';
import { createId } from '@/lib/utils/ids';

export interface DeterministicToolRoute {
  call: JarvisToolCall;
  successMessage: string;
}

export function routeDeterministicTool(text: string): DeterministicToolRoute | null {
  const trimmed = text.trim();
  const normalized = trimmed.toLowerCase();

  if (
    normalized === 'open settings' ||
    normalized === 'open app settings' ||
    normalized === 'افتح الإعدادات' ||
    normalized === 'افتح الاعدادات'
  ) {
    return {
      call: { id: createId('tool'), tool: 'device.open_settings', arguments: {} },
      successMessage: 'Opened JARVIS application settings.',
    };
  }

  const urlMatch = trimmed.match(/^(?:open|افتح)\s+(https?:\/\/\S+)$/i);
  if (urlMatch?.[1]) {
    return {
      call: { id: createId('tool'), tool: 'device.open_url', arguments: { url: urlMatch[1] } },
      successMessage: `Opened ${urlMatch[1]}`,
    };
  }

  if (normalized === 'termux status' || normalized === 'حالة termux') {
    return {
      call: { id: createId('tool'), tool: 'termux.system_status', arguments: {} },
      successMessage: 'Termux bridge responded successfully.',
    };
  }

  return null;
}
