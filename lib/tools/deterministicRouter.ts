import type { JarvisToolCall } from './types';
import { createId } from '@/lib/utils/ids';

const KNOWN_APPS: Record<string, string> = {
  gmail: 'com.google.android.gm',
  email: 'com.google.android.gm',
  youtube: 'com.google.android.youtube',
  whatsapp: 'com.whatsapp',
  chrome: 'com.android.chrome',
  photos: 'com.google.android.apps.photos',
  'google photos': 'com.google.android.apps.photos',
};

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
    normalized === 'open camera' ||
    normalized === 'camera' ||
    normalized === 'افتح الكاميرا' ||
    normalized === 'شغل الكاميرا'
  ) {
    return {
      call: { id: createId('tool'), tool: 'device.open_camera', arguments: {} },
      successMessage: 'Opened the camera.',
    };
  }

  if (
    normalized === 'open dialer' ||
    normalized === 'open phone' ||
    normalized === 'افتح الاتصال' ||
    normalized === 'افتح الهاتف'
  ) {
    return {
      call: { id: createId('tool'), tool: 'device.open_dialer', arguments: {} },
      successMessage: 'Opened the dialer.',
    };
  }

  const dialMatch = trimmed.match(/^(?:dial|call)\s+([+0-9 ()-]{3,40})$/i);
  if (dialMatch?.[1]) {
    return {
      call: { id: createId('tool'), tool: 'device.open_dialer', arguments: { number: dialMatch[1].trim() } },
      successMessage: `Opened the dialer for ${dialMatch[1].trim()}. Tap Call to place it.`,
    };
  }

  if (
    normalized === 'open messages' ||
    normalized === 'open sms' ||
    normalized === 'افتح الرسائل' ||
    normalized === 'افتح المسجات'
  ) {
    return {
      call: { id: createId('tool'), tool: 'device.compose_sms', arguments: {} },
      successMessage: 'Opened the SMS composer.',
    };
  }

  if (
    normalized === 'open wifi settings' ||
    normalized === 'wifi settings' ||
    normalized === 'افتح إعدادات الواي فاي' ||
    normalized === 'افتح اعدادات الواي فاي'
  ) {
    return {
      call: { id: createId('tool'), tool: 'device.open_wifi_settings', arguments: {} },
      successMessage: 'Opened Wi-Fi settings.',
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

  const englishApp = trimmed.match(/^(?:open|launch)\s+(?:the\s+)?(.+)$/i);
  const arabicApp = trimmed.match(/^(?:افتح|شغل)\s+(.+)$/u);
  const requestedApp = (englishApp?.[1] ?? arabicApp?.[1])?.trim().toLowerCase();
  const packageName = requestedApp ? KNOWN_APPS[requestedApp] : undefined;
  if (packageName) {
    return {
      call: { id: createId('tool'), tool: 'termux.app_open', arguments: { package: packageName } },
      successMessage: `Opened ${requestedApp}.`,
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
