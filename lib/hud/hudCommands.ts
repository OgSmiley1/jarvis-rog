/**
 * Commands the HUD handles itself because they act on the app, not the phone:
 * switching the answer language, and sharing the last answer to another app
 * (the phone's share sheet — the owner picks where, nothing is sent by itself).
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

export function languageSwitchedReply(language: 'en' | 'ar'): string {
  return language === 'ar' ? 'تم. سأتحدث بالعربية من الآن.' : "Done. I'll speak English from now on.";
}
