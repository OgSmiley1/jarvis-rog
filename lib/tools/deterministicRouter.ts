import type { JarvisToolCall } from './types';
import { createId } from '@/lib/utils/ids';

export interface DeterministicToolRoute {
  call: JarvisToolCall;
  successMessage: string;
}

function stripWakeWord(text: string): string {
  return text
    .trim()
    .replace(/^(?:jarvis|جارفيس|جارفس|جارفز)[\s,:;.!?،؟-]*/iu, '')
    .trim();
}

export function routeDeterministicTool(text: string): DeterministicToolRoute | null {
  const trimmed = stripWakeWord(text);
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

  if (
    normalized === 'open email' ||
    normalized === 'open mail' ||
    normalized === 'افتح الإيميل' ||
    normalized === 'افتح الايميل' ||
    normalized === 'افتح البريد'
  ) {
    return {
      call: { id: createId('tool'), tool: 'device.compose_email', arguments: {} },
      successMessage: 'Opened the email composer.',
    };
  }

  const emailMatch = trimmed.match(/^(?:email|send\s+(?:an\s+)?email\s+to)\s+([^\s]+@[^\s]+)$/i);
  if (emailMatch?.[1]) {
    return {
      call: { id: createId('tool'), tool: 'device.compose_email', arguments: { to: emailMatch[1] } },
      successMessage: `Opened an email to ${emailMatch[1]}.`,
    };
  }

  if (normalized === 'open maps' || normalized === 'open map' || normalized === 'افتح الخريطة' || normalized === 'افتح الخريطه' || normalized === 'افتح الماب') {
    return {
      call: { id: createId('tool'), tool: 'device.open_url', arguments: { url: 'https://www.google.com/maps' } },
      successMessage: 'Opened Maps.',
    };
  }

  const englishMap = trimmed.match(/^(?:open|show|find|check)\s+(?:me\s+)?(?:the\s+)?(?:map|maps)(?:\s+(?:of|for))?\s+(.+)$/i);
  const arabicMap = trimmed.match(/^(?:افتح|شوف|وريني|ابحث)\s+(?:لي\s+)?(?:الخريطة|الخريطه|الماب|خرائط)\s+(?:بتاعت\s+|حق\s+)?(.+)$/u);
  const mapQuery = englishMap?.[1] ?? arabicMap?.[1];
  if (mapQuery?.trim()) {
    return {
      call: { id: createId('tool'), tool: 'device.open_map_search', arguments: { query: mapQuery.trim() } },
      successMessage: `Opened Maps for ${mapQuery.trim()}.`,
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
