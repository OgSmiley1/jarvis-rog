import qrcode from 'qrcode-generator';

/**
 * Things JARVIS does entirely on the phone: QR codes, a joke when offline,
 * a line of encouragement. No network, no cost.
 */

export interface QrMatrix {
  size: number;
  /** One SVG path covering every dark module, in module units. Cheap to draw. */
  path: string;
  text: string;
}

export const MAX_QR_CHARS = 1_200;

/** Encode text as a QR code, locally. UTF-8, so Arabic works. Medium error correction. */
export function makeQr(text: string): QrMatrix | null {
  const value = text.trim();
  if (!value || value.length > MAX_QR_CHARS) return null;
  const previous = qrcode.stringToBytes;
  try {
    qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'] ?? previous;
    const qr = qrcode(0, 'M');
    qr.addData(value, 'Byte');
    qr.make();
    const size = qr.getModuleCount();
    let path = '';
    for (let row = 0; row < size; row += 1) {
      // Merge runs of dark modules in a row into one rectangle each.
      let col = 0;
      while (col < size) {
        if (!qr.isDark(row, col)) {
          col += 1;
          continue;
        }
        const start = col;
        while (col < size && qr.isDark(row, col)) col += 1;
        path += `M${start} ${row}h${col - start}v1h-${col - start}z`;
      }
    }
    return { size, path, text: value };
  } catch {
    return null;
  } finally {
    qrcode.stringToBytes = previous;
  }
}

/** A small curated set for offline use. Clean, and not about anyone real. */
const JOKES: Record<'en' | 'ar', string[]> = {
  en: [
    "I told my phone a joke about batteries. It didn't get a charge out of it.",
    'Why did the developer go broke? He used up all his cache.',
    "I'd tell you a UDP joke, but you might not get it.",
    'Parallel lines have so much in common. It is a shame they will never meet.',
    'I asked the Wi-Fi for its password. It said it would rather stay connected.',
    'Why do programmers prefer dark mode? Because light attracts bugs.',
  ],
  ar: [
    'قال الهاتف للشاحن: من دونك أحس إني فاضي.',
    'سألت الواي فاي عن سرّه، قال: كلمة السر عندي أنا بس.',
    'المبرمج ما ينام، لأنه دايمًا في حلقة لا نهائية.',
    'الساعة قالت للمنبه: خلّك هادي، الناس نايمين.',
  ],
};

const LINES: Record<'en' | 'ar', string[]> = {
  en: [
    'Small steps, every day. That is how big things get built.',
    'Done is better than perfect. Ship it, then improve it.',
    'Focus on the next right move, not the whole mountain.',
    'You have handled every hard day so far. This one too.',
  ],
  ar: [
    'خطوة صغيرة كل يوم، هكذا تُبنى الأشياء الكبيرة.',
    'المنجز أفضل من الكامل. ابدأ ثم حسّن.',
    'ركّز على الخطوة الصحيحة القادمة، لا على الجبل كله.',
  ],
};

export function localJoke(lang: 'en' | 'ar', seed = Date.now()): string {
  const list = JOKES[lang];
  return list[Math.abs(Math.floor(seed / 1000)) % list.length]!;
}

export function localLine(lang: 'en' | 'ar', seed = Date.now()): string {
  const list = LINES[lang];
  return list[Math.abs(Math.floor(seed / 1000)) % list.length]!;
}
