/**
 * The dashboard's clock, date and status line. Pure, so the exact words the
 * owner sees are tested rather than assumed.
 */

type Lang = 'en' | 'ar';

const DAYS_EN = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const MONTHS_EN = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

/** `03:43` (24-hour) and `THURSDAY 25 SEPTEMBER` / `الخميس 25 سبتمبر`. */
export function formatClock(now: Date, lang: Lang): { time: string; date: string } {
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const date =
    lang === 'ar'
      ? `${DAYS_AR[now.getDay()]} ${now.getDate()} ${MONTHS_AR[now.getMonth()]}`
      : `${DAYS_EN[now.getDay()]} ${now.getDate()} ${MONTHS_EN[now.getMonth()]}`;
  return { time, date };
}

/** "Qwen3-4B-Q4_K_M.gguf" → "Qwen3 4B". Unknown names pass through without the extension. */
export function shortModelName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const base = name.replace(/\.gguf$/i, '');
  const match = /^([A-Za-z]+[0-9.]*)[-_ ]([0-9.]+[BbMm])/.exec(base);
  return match ? `${match[1]} ${match[2]!.toUpperCase()}` : base;
}

export interface StatusInput {
  modelStatus: 'unloaded' | 'loading' | 'ready' | 'error';
  modelName?: string;
  cloudReady: boolean;
  micOn: boolean;
  camera?: boolean;
  /** 0..1, or negative/undefined when unknown. */
  battery?: number;
  charging?: boolean;
}

/** `Qwen3 4B · mic on · 34%` — one line, only facts the phone reported. */
export function statusLine(input: StatusInput, lang: Lang): string {
  const ar = lang === 'ar';
  const brain =
    input.modelStatus === 'ready'
      ? shortModelName(input.modelName) ?? (ar ? 'العقل جاهز' : 'brain ready')
      : input.modelStatus === 'loading'
        ? ar ? 'تحميل العقل…' : 'loading brain…'
        : input.cloudReady
          ? ar ? 'العقل السحابي' : 'cloud brain'
          : ar ? 'لا يوجد عقل' : 'no brain';
  const parts = [brain, input.micOn ? (ar ? 'الميكروفون يعمل' : 'mic on') : ar ? 'الميكروفون متوقف' : 'mic off'];
  if (input.camera) parts.push(ar ? 'الكاميرا تعمل' : 'camera on');
  if (typeof input.battery === 'number' && input.battery >= 0) {
    parts.push(`${Math.round(input.battery * 100)}%${input.charging ? ' ⚡' : ''}`);
  }
  return parts.join(' · ');
}
