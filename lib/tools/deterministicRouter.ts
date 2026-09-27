import type { JarvisToolCall } from './types';
import { createId } from '@/lib/utils/ids';
import { extractExpression } from '@/lib/utils/voiceMath';

export interface DeterministicToolRoute {
  call: JarvisToolCall;
  successMessage: string;
}

function stripWakeWord(text: string): string {
  return text
    .trim()
    .replace(/^(?:jarvis|جارفيس|جارفس|جارفز)[\s,:;.!?،؟-]*/iu, '')
    .replace(/[\s.!?؟]+$/u, '')
    .trim();
}

const hasArabic = (text: string) => /[\u0600-\u06FF]/.test(text);

function tool(name: string, args: Record<string, unknown>, successMessage = 'Done.'): DeterministicToolRoute {
  return { call: { id: createId('tool'), tool: name, arguments: args }, successMessage };
}

const SITES: Record<string, { home: string; search: (q: string, ar: boolean) => string; name: string }> = {
  google: { name: 'Google', home: 'https://www.google.com', search: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
  youtube: { name: 'YouTube', home: 'https://www.youtube.com', search: (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}` },
  wikipedia: {
    name: 'Wikipedia',
    home: 'https://www.wikipedia.org',
    search: (q, ar) => `https://${ar ? 'ar' : 'en'}.wikipedia.org/w/index.php?search=${encodeURIComponent(q)}`,
  },
};
const SITE_ALIASES: Record<string, string> = { جوجل: 'google', قوقل: 'google', غوغل: 'google', يوتيوب: 'youtube', ويكيبيديا: 'wikipedia' };

/** The video-2 basics: time, date, sums, system report, named websites and site searches. */
function routeUtility(trimmed: string, normalized: string): DeterministicToolRoute | null {
  const lang = hasArabic(trimmed) ? 'ar' : 'en';
  const ar = lang === 'ar';

  if (/^(?:what(?:'s|\s+is)\s+the\s+time\s+and\s+date|time\s+and\s+date)$/.test(normalized)) return tool('utility.time', { what: 'both', lang });
  if (/^(?:what(?:'s|\s+is)\s+the\s+time|what\s+time\s+is\s+it|tell\s+me\s+the\s+time|the\s+time|time)$/.test(normalized) || /^(?:كم\s+الساع[ةه]|الساع[ةه]\s+كم)$/u.test(trimmed)) {
    return tool('utility.time', { what: 'time', lang });
  }
  if (
    /^(?:what(?:'s|\s+is)\s+(?:the\s+|today'?s\s+)?(?:date|day)(?:\s+today)?|what\s+day\s+is\s+(?:it|today)|today'?s\s+date|the\s+date|date)$/.test(normalized) ||
    /^(?:ما\s+(?:هو\s+)?التاريخ|كم\s+التاريخ|التاريخ\s+اليوم|ايش\s+التاريخ|وش\s+التاريخ)$/u.test(trimmed)
  ) {
    return tool('utility.time', { what: 'date', lang });
  }

  if (
    /^(?:give\s+me\s+(?:the\s+)?system\s+(?:information|info|status|report)|system\s+(?:information|info|status|report)|(?:phone|device)\s+(?:status|information|info|report)|how(?:'s|\s+is)\s+the\s+(?:phone|system))$/.test(normalized) ||
    /^(?:أعطني\s+|اعطني\s+)?(?:معلومات|حالة)\s+(?:النظام|الجهاز|الهاتف|الجوال)$/u.test(trimmed)
  ) {
    return tool('utility.system_status', { lang });
  }

  const expression = extractExpression(trimmed);
  if (expression) return tool('utility.calculate', { expression, lang });

  const openSite = normalized.match(/^open\s+(google|youtube|wikipedia)(?:\s+website|\s+site|\s+in\s+(?:the\s+)?browser)$/);
  if (openSite?.[1]) {
    const site = SITES[openSite[1]]!;
    return tool('device.open_url', { url: site.home }, `Opening ${site.name} in the browser.`);
  }

  const siteSearch =
    normalized.match(/^(?:search(?:\s+for)?|look\s+up|find)\s+(.+?)\s+(?:on|in)\s+(google|youtube|wikipedia)$/) ??
    trimmed.match(/^(?:ابحث|دور|دوّر)\s+(?:عن|على)\s+(.+?)\s+(?:في|على|ب)\s*(جوجل|قوقل|غوغل|يوتيوب|ويكيبيديا)$/u);
  if (siteSearch?.[1] && siteSearch[2]) {
    const key = SITE_ALIASES[siteSearch[2]] ?? siteSearch[2];
    const site = SITES[key];
    if (site) {
      const query = siteSearch[1].trim();
      return tool(
        'device.open_url',
        { url: site.search(query, ar) },
        ar ? `أبحث عن ${query} في ${site.name}. (يحتاج إنترنت)` : `Searching ${site.name} for ${query}. That one needs the internet.`,
      );
    }
  }
  return null;
}

/** "What do you see?" — the only way the camera ever opens. */
function routeVision(trimmed: string, normalized: string): DeterministicToolRoute | null {
  const lang = hasArabic(trimmed) ? 'ar' : 'en';
  const plain =
    /^(?:what\s+(?:do|can)\s+you\s+see|what(?:'s|\s+is)\s+(?:this|that|in\s+front\s+of\s+me)|look(?:\s+at\s+(?:this|that))?|describe\s+(?:this|that|what\s+you\s+see)|(?:use\s+the\s+)?camera\s+and\s+look)$/.test(normalized) ||
    /^(?:ماذا|شو|ايش|إيش|وش)\s+(?:ترى|تشوف)$/u.test(trimmed) ||
    /^(?:شوف|انظر|أنظر)\s+(?:هذا|هذه|هذي)$/u.test(trimmed) ||
    /^(?:ما|وش|شو|ايش)\s+(?:هذا|هذه|هذي)$/u.test(trimmed);
  if (plain) return tool('vision.look', { lang });
  const asked =
    normalized.match(/^look\s+at\s+this\s+and\s+(?:tell\s+me\s+)?(.+)$/) ??
    normalized.match(/^(read\s+(?:this|that)(?:\s+.+)?)$/);
  if (asked?.[1]) return tool('vision.look', { question: asked[1].trim(), lang });
  return null;
}

/**
 * The phone commands: messages, calls, calendar, battery, calling and texting
 * a contact, web search. Each tool returns its own spoken sentence.
 */
function routePhone(trimmed: string, normalized: string): DeterministicToolRoute | null {
  const lang = hasArabic(trimmed) ? 'ar' : 'en';

  if (
    /^(?:read|check|show)(?:\s+me)?\s+(?:my\s+)?(?:new\s+|latest\s+|recent\s+|unread\s+|last\s+)?(?:messages|texts|sms)$/.test(normalized) ||
    /^(?:do\s+i\s+have\s+)?any\s+(?:new\s+)?(?:messages|texts)$/.test(normalized) ||
    /^what\s+are\s+my\s+(?:messages|texts)$/.test(normalized) ||
    /^(?:اقرأ|اقرا|اقري|شوف)\s+(?:لي\s+)?(?:ال)?(?:رسائل|رسايل|مسجات)/u.test(trimmed) ||
    /عندي\s+(?:أي\s+|اي\s+)?(?:رسائل|رسايل|مسجات)/u.test(trimmed)
  ) {
    return tool('phone.read_messages', { lang });
  }

  if (/\bmissed\s+calls?\b/.test(normalized) || /مكالمات\s+(?:فائتة|فايتة|فائته|فايته)/u.test(trimmed)) {
    return tool('phone.recent_calls', { missed: true, lang });
  }
  if (
    /^(?:who\s+(?:called|rang)(?:\s+me)?|(?:show\s+(?:me\s+)?)?(?:my\s+)?(?:recent\s+calls|call\s+log|call\s+history|last\s+calls?))$/.test(normalized) ||
    /^(?:مين|من)\s+(?:اتصل|دق|كلمني)/u.test(trimmed) ||
    /سجل\s+المكالمات/u.test(trimmed)
  ) {
    return tool('phone.recent_calls', { missed: false, lang });
  }

  const calendar = normalized.match(
    /^(?:what(?:'s|\s+is)\s+on\s+my\s+(?:calendar|schedule|agenda)|(?:show|read|check)\s+(?:me\s+)?my\s+(?:calendar|schedule|agenda|appointments|meetings)|my\s+(?:calendar|schedule|agenda|appointments|meetings)|what\s+do\s+i\s+have|do\s+i\s+have\s+(?:any\s+)?(?:meetings|appointments))(?:\s+(?:for\s+)?(today|tomorrow|this\s+week))?$/,
  );
  if (calendar) {
    const when = calendar[1] ?? 'today';
    return tool('phone.calendar', { span: when.startsWith('this') ? 'week' : when, lang });
  }
  if (/(?:جدولي|جدول\s+اليوم|مواعيدي|اجتماعاتي|التقويم)/u.test(trimmed)) {
    const span = /(?:بكرة|بكره|غدا|غدًا|غداً|باچر|باكر)/u.test(trimmed) ? 'tomorrow' : /(?:الأسبوع|الاسبوع)/u.test(trimmed) ? 'week' : 'today';
    return tool('phone.calendar', { span, lang });
  }

  if (
    /^(?:(?:what(?:'s|\s+is)\s+(?:my\s+|the\s+)?)?battery(?:\s+(?:level|status|percentage))?|how\s+much\s+battery(?:\s+(?:do\s+i\s+have|is\s+left|left))?|am\s+i\s+charging)$/.test(normalized) ||
    /^(?:كم\s+)?(?:البطارية|البطاريه|الشحن|الشحنة)(?:\s+كم)?$/u.test(trimmed)
  ) {
    return tool('phone.battery', { lang });
  }

  const call = trimmed.match(/^(?:call|dial|phone|ring)\s+(.+)$/i) ?? trimmed.match(/^(?:اتصل|اتّصل|كلم|كلّم|دق)\s+(?:على\s+|علي\s+|بـ\s*)?(.+)$/u);
  if (call?.[1]) return tool('phone.call', { who: call[1].trim(), lang });

  const text =
    trimmed.match(/^(?:text|message|sms|send\s+(?:a\s+)?(?:text|message|sms)\s+to)\s+(.+?)(?:\s+(?:saying|that\s+says|and\s+say|say)\s+(.+))?$/i) ??
    trimmed.match(/^(?:ارسل|أرسل|ابعث|راسل)\s+(?:رسالة\s+|رساله\s+|مسج\s+)?(?:إلى\s+|الى\s+)?(.+?)(?:\s+(?:وقل|قل|وقول|قول|يقول|تقول)\s+(.+))?$/u);
  if (text?.[1]) {
    return tool('phone.text', { who: text[1].trim(), ...(text[2] ? { body: text[2].trim() } : {}), lang });
  }

  const search =
    trimmed.match(/^(?:search\s+(?:the\s+web\s+|google\s+)?for|google|look\s+up|search)\s+(.+)$/i) ??
    trimmed.match(/^(?:ابحث|دور|دوّر)\s+(?:عن|على)\s+(.+)$/u);
  if (search?.[1]) return tool('phone.web_search', { query: search[1].trim(), lang });

  return null;
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

  const urlMatch = trimmed.match(/^(?:open|افتح)\s+(https?:\/\/\S+)$/i);
  if (urlMatch?.[1]) {
    return {
      call: { id: createId('tool'), tool: 'device.open_url', arguments: { url: urlMatch[1] } },
      successMessage: `Opened ${urlMatch[1]}`,
    };
  }

  const utility = routeUtility(trimmed, normalized);
  if (utility) return utility;

  const look = routeVision(trimmed, normalized);
  if (look) return look;

  const phoneRoute = routePhone(trimmed, normalized);
  if (phoneRoute) return phoneRoute;

  // Any installed app, matched by name on the phone itself.
  const englishApp = trimmed.match(/^(?:open|launch|start)\s+(?:the\s+)?(.+?)(?:\s+app)?$/i);
  const arabicApp = trimmed.match(/^(?:افتح|شغل|شغّل)\s+(?:تطبيق\s+)?(.+)$/u);
  const requestedApp = (englishApp?.[1] ?? arabicApp?.[1])?.trim();
  if (requestedApp) return tool('phone.open_app', { name: requestedApp, lang: hasArabic(trimmed) ? 'ar' : 'en' });

  if (normalized === 'termux status' || normalized === 'حالة termux') {
    return {
      call: { id: createId('tool'), tool: 'termux.system_status', arguments: {} },
      successMessage: 'Termux bridge responded successfully.',
    };
  }

  return null;
}
