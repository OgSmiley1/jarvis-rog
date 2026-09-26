/**
 * Commands the HUD handles itself because they act on the app, not the phone:
 * switching the answer language, sharing the last answer to another app
 * (the phone's share sheet — the owner picks where, nothing is sent by itself),
 * and showing or hiding the live camera page.
 */

const WAKE = /^(?:jarvis|جارفيس|جارفس|جارفز)[\s,:;.!?،؟-]*/iu;
const clean = (text: string) => text.trim().replace(WAKE, '').replace(/[\s.!?؟]+$/u, '').trim().toLowerCase();

export function detectLanguageSwitch(text: string): 'en' | 'ar' | null {
  const t = clean(text);
  const english = /^(?:change|switch|set)\s+(?:the\s+)?language\s+(?:to|into)\s+english$|^(?:speak|talk|answer)\s+(?:in\s+)?english$|^(?:غير|غيّر|حوّل|حول)\s+اللغة\s+(?:إلى|الى|ل)\s*(?:الإنجليزية|الانجليزية|الإنجليزي|الانجليزي)$|^(?:كلمني|تكلم)\s+(?:بالإنجليزي|بالانجليزي)$/u;
  const arabic = /^(?:change|switch|set)\s+(?:the\s+)?language\s+(?:to|into)\s+arabic$|^(?:speak|talk|answer)\s+(?:in\s+)?arabic$|^(?:غير|غيّر|حوّل|حول)\s+اللغة\s+(?:إلى|الى|ل)\s*(?:العربية|العربي)$|^(?:كلمني|تكلم)\s+(?:بالعربي|عربي)$/u;
  if (english.test(t)) return 'en';
  if (arabic.test(t)) return 'ar';
  return null;
}

export function isShareCommand(text: string): boolean {
  const t = clean(text);
  return /^(?:share|send)\s+(?:that|this|it|the\s+answer)(?:\s+(?:to|with|on|via)\s+.+)?$|^(?:write|put)\s+(?:that|this|it)\s+(?:in|into)\s+.+$|^(?:شارك|ارسل|أرسل)\s+(?:هذا|هذه|الجواب|الرد)(?:\s+.+)?$/u.test(t);
}

export type HudPage = 'orb' | 'camera';

/** "open the camera" / «افتح الكاميرا» shows the live camera page; "close the camera" returns to the orb. */
export function detectPageSwitch(text: string): HudPage | null {
  const t = clean(text);
  if (/^(?:open|show|start|turn\s+on)\s+(?:the\s+|your\s+|my\s+)?(?:camera|eyes)(?:\s+view)?$|^camera\s+view$|^(?:افتح|شغل|شغّل)\s+(?:الكاميرا|الكامره|عيونك)$/u.test(t)) {
    return 'camera';
  }
  if (/^(?:close|hide|stop|turn\s+off)\s+(?:the\s+|your\s+|my\s+)?(?:camera|eyes)(?:\s+view)?$|^(?:back\s+to\s+(?:the\s+)?(?:orb|home))$|^(?:أغلق|اغلق|سكر|سكّر|طفي)\s+(?:الكاميرا|الكامره|عيونك)$/u.test(t)) {
    return 'orb';
  }
  return null;
}

export function pageSwitchedReply(page: HudPage, language: 'en' | 'ar'): string {
  if (page === 'camera') return language === 'ar' ? 'الكاميرا مفتوحة. اسألني ماذا أرى.' : 'Camera on. Ask me what I see.';
  return language === 'ar' ? 'أغلقت الكاميرا.' : 'Camera off.';
}

export function languageSwitchedReply(language: 'en' | 'ar'): string {
  return language === 'ar' ? 'تم. سأتحدث بالعربية من الآن.' : "Done. I'll speak English from now on.";
}
