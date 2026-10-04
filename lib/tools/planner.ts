import type { CompletionMessage, ResponseLanguage } from '@/lib/inference/types';
import { listToolSchemas } from './registry';

export const NO_TOOL = 'assistant.none';

const ARGUMENT_HINTS: Record<string, string> = {
  'device.open_map_search': '{"query":"place or address"}',
  'device.compose_email': '{"to":"optional@example.com","subject":"optional","body":"optional"}',
  'device.open_url': '{"url":"https://..."}',
  'device.open_settings': '{}',
  'assistant.speak': '{"text":"what to say","language":"en|ar"}',
  'assistant.stop_speaking': '{}',
  'termux.system_status': '{}',
  'termux.app_open': '{"package":"Android package name"}',
  'termux.git_status': '{"path":"explicit repository path"}',
  'live.weather': '{"city":"optional city name","day":"today|tomorrow","lang":"en|ar"}',
  'live.prayer': '{"city":"optional city","prayer":"optional Fajr|Sunrise|Dhuhr|Asr|Maghrib|Isha","all":false,"tomorrow":false,"lang":"en|ar"}',
  'live.brief': '{"city":"optional city","lang":"en|ar"}',
  'live.quran': '{"reference":"surah:verse e.g. 2:255, or a short surah number 1|103|108|112|113|114","translate":true,"lang":"en|ar"}',
  'live.headlines': '{"topic":"optional topic","lang":"en|ar"}',
  'live.space_news': '{"lang":"en|ar"}',
  'live.joke': '{"lang":"en|ar"}',
  'live.quote': '{"lang":"en|ar"}',
  'live.where_am_i': '{"lang":"en|ar"}',
  'local.timer': '{"seconds":300,"label":"optional","lang":"en|ar"}',
  'local.alarm': '{"hour":6,"minute":30,"label":"optional","lang":"en|ar"}',
  'local.show_timers': '{"lang":"en|ar"}',
  'local.qr': '{"text":"link or text to encode","lang":"en|ar"}',
  'local.note_add': '{"text":"the note","lang":"en|ar"}',
  'local.notes_read': '{"lang":"en|ar"}',
  'device.settings_panel': '{"panel":"wifi|bluetooth|battery|display|sound|location|airplane|notifications|data","lang":"en|ar"}',
};

export function looksLikeToolRequest(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  return /\b(open|send|email|mail|map|maps|find|check|status|speak|stop|git|launch|show)\b/i.test(normalized)
    // Live data and local utilities: phrasing the deterministic routes did not catch.
    || /\b(weather|forecast|temperature|rain|hot|cold|humid|prayer|pray|salah|fajr|dhuhr|zuhr|asr|maghrib|isha|quran|surah|ayah|verse|news|headlines|joke|quote|inspire|timer|alarm|wake me|remind|note|qr)\b/i.test(normalized)
    || /(?:افتح|ارسل|أرسل|ايميل|إيميل|بريد|خريطة|خريطه|الماب|شوف|وريني|ابحث|حالة|اتكلم|قول|وقف)/u.test(normalized)
    || /(?:الطقس|الجو|حرار|مطر|صلا|أذان|اذان|الفجر|الظهر|العصر|المغرب|العشاء|قرآن|سورة|آية|اخبار|أخبار|نكت|مؤقت|منبه|صحني|ملاحظ|باركود)/u.test(normalized);
}

export function buildToolPlanningMessages(text: string, language: ResponseLanguage): CompletionMessage[] {
  const tools = listToolSchemas()
    .map((tool) => `- ${tool.name} arguments ${ARGUMENT_HINTS[tool.name] ?? '{}'}: ${tool.description}`)
    .join('\n');

  const languageNote = language === 'ar'
    ? 'The owner may speak Arabic or Sudanese Arabic. Understand the intent, but tool names and JSON keys stay exactly as defined.'
    : 'The owner may speak naturally. Tool names and JSON keys must stay exactly as defined.';

  return [
    {
      role: 'system',
      content: [
        'You are the JARVIS tool planner.',
        'Choose exactly one tool only when the owner is asking JARVIS to perform a real action.',
        `If no listed tool can truthfully perform the request, choose ${NO_TOOL} with empty arguments.`,
        'Never invent a tool. Never claim an action happened here; execution happens separately.',
        languageNote,
        'Available tools:',
        tools,
        `- ${NO_TOOL} arguments {}: no suitable action tool is available.`,
      ].join('\n'),
    },
    { role: 'user', content: text.trim() },
  ];
}
