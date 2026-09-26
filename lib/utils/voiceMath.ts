/**
 * Spoken arithmetic, offline, without eval: "calculate 200 plus 400 plus 300",
 * "what's 12 times 7", «احسب ٤٠٠ زائد ٣٠٠», "20 percent of 350".
 *
 * A small tokenizer and a precedence-climbing parser over + − × ÷ ^ and
 * brackets. Inputs are bounded (length, token count, exponent size) so a
 * mis-heard sentence can never turn into an expensive computation.
 */

const MAX_TOKENS = 60;
const MAX_EXPONENT = 64;

const ARABIC_DIGITS: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

// Order matters: longer phrases first.
const WORDS: Array<[RegExp, string]> = [
  [/\bto the power of\b|\braised to\b|\bpower of\b/g, '^'],
  [/\bmultiplied by\b|\bmultiply by\b|\btimes\b|\bx\b|×/g, '*'],
  [/\bdivided by\b|\bdivide by\b|\bover\b|÷/g, '/'],
  [/\bplus\b|\badd\b|\band\b/g, '+'],
  [/\bminus\b|\bsubtract\b|\bless\b|−/g, '-'],
  [/\bsquared\b/g, '^2'],
  [/\bcubed\b/g, '^3'],
  [/مضروب\s*في|ضرب|×/gu, '*'],
  [/مقسوم\s*على|تقسيم|قسمة|على/gu, '/'],
  [/زائد|زايد|و(?=\s*\d)/gu, '+'],
  [/ناقص|نقص/gu, '-'],
  [/أس|اس/gu, '^'],
];

type Token = { kind: 'num'; value: number } | { kind: 'op'; value: string };

export function normalizeMath(text: string): string {
  let out = text.toLowerCase().replace(/[٠-٩۰-۹]/g, (digit) => ARABIC_DIGITS[digit] ?? digit);
  out = out.replace(/٫/g, '.').replace(/(\d),(?=\d{3}\b)/g, '$1');
  // "20 percent of 350" / "20% of 350" → (20/100)*350
  out = out.replace(/(\d+(?:\.\d+)?)\s*(?:%|percent|per cent|بالمية|بالمائة)\s*(?:of|من)\s*(\d+(?:\.\d+)?)/g, '($1/100)*$2');
  for (const [pattern, symbol] of WORDS) out = out.replace(pattern, ` ${symbol} `);
  return out;
}

function tokenize(text: string): Token[] | null {
  const tokens: Token[] = [];
  const pattern = /\d+(?:\.\d+)?|[-+*/^()]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const piece = match[0];
    if (/\d/.test(piece)) {
      if (piece.replace('.', '').length > 15) return null;
      tokens.push({ kind: 'num', value: Number(piece) });
    } else {
      tokens.push({ kind: 'op', value: piece });
    }
    if (tokens.length > MAX_TOKENS) return null;
  }
  // A mis-heard word before the first number leaves a dangling operator
  // ("red + 400 + 300", heard for "add 400 + 300"): drop it.
  while (tokens[0]?.kind === 'op' && tokens[0].value !== '(' && tokens[0].value !== '-') tokens.shift();
  return tokens;
}

const PRECEDENCE: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3 };

function parse(tokens: Token[]): number {
  let index = 0;
  const peek = () => tokens[index];

  const primary = (): number => {
    const token = tokens[index++];
    if (!token) throw new Error('MATH_INCOMPLETE');
    if (token.kind === 'num') return token.value;
    if (token.value === '-') return -primary();
    if (token.value === '(') {
      const value = expression(1);
      const close = tokens[index++];
      if (!close || close.kind !== 'op' || close.value !== ')') throw new Error('MATH_BRACKETS');
      return value;
    }
    throw new Error('MATH_UNEXPECTED');
  };

  const expression = (minPrecedence: number): number => {
    let left = primary();
    for (;;) {
      const op = peek();
      if (!op || op.kind !== 'op' || !(op.value in PRECEDENCE)) return left;
      const precedence = PRECEDENCE[op.value]!;
      if (precedence < minPrecedence) return left;
      index += 1;
      // ^ is right-associative; the rest are left-associative.
      const right = expression(op.value === '^' ? precedence : precedence + 1);
      left = apply(op.value, left, right);
    }
  };

  const value = expression(1);
  if (index !== tokens.length) throw new Error('MATH_TRAILING');
  return value;
}

function apply(op: string, left: number, right: number): number {
  switch (op) {
    case '+':
      return left + right;
    case '-':
      return left - right;
    case '*':
      return left * right;
    case '/':
      if (right === 0) throw new Error('MATH_DIVIDE_BY_ZERO');
      return left / right;
    case '^':
      if (Math.abs(right) > MAX_EXPONENT) throw new Error('MATH_TOO_LARGE');
      return left ** right;
    default:
      throw new Error('MATH_UNEXPECTED');
  }
}

/** The arithmetic in a sentence, or null when there is none to do (at least two numbers and an operator). */
export function extractExpression(sentence: string): string | null {
  const normalized = normalizeMath(sentence);
  const tokens = tokenize(normalized);
  if (!tokens) return null;
  const numbers = tokens.filter((token) => token.kind === 'num').length;
  const operators = tokens.filter((token) => token.kind === 'op' && token.value in PRECEDENCE).length;
  if (numbers < 2 || operators < 1) return null;
  // Only arithmetic may remain once the numbers and operators are taken out.
  const leftover = normalized
    // A single mis-heard word right before an operator ("red + 400") is not a reason to give up.
    .replace(/^\s*[a-z]+\s+(?=[-+*/^]\s*\d)/, '')
    .replace(/\d+(?:\.\d+)?|[-+*/^()]/g, ' ')
    .replace(/\b(?:calculate|compute|what(?:'s| is)|how much is|equals?|the|result|of|please|jarvis|is)\b|احسب|كم|يساوي|الناتج|جارفيس|جارفس|؟|\?/gu, ' ')
    .trim();
  if (leftover && !/^[\s.,]*$/.test(leftover)) return null;
  return tokens.map((token) => String(token.value)).join(' ');
}

export function evaluate(expression: string): number {
  const tokens = tokenize(expression);
  if (!tokens || tokens.length === 0) throw new Error('MATH_INCOMPLETE');
  const value = parse(tokens);
  if (!Number.isFinite(value)) throw new Error('MATH_TOO_LARGE');
  return value;
}

/** Up to six decimals, no trailing zeros, no "-0". */
export function formatNumber(value: number): string {
  const rounded = Math.round(value * 1e6) / 1e6;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

export function describeCalculation(expression: string, lang: 'en' | 'ar'): string {
  try {
    const result = formatNumber(evaluate(expression));
    const shown = expression.replace(/\*/g, '×').replace(/\//g, '÷');
    return lang === 'ar' ? `${shown} يساوي ${result}.` : `${shown} is ${result}.`;
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'MATH_DIVIDE_BY_ZERO') return lang === 'ar' ? 'لا يمكن القسمة على صفر.' : "That divides by zero, so there's no answer.";
    if (code === 'MATH_TOO_LARGE') return lang === 'ar' ? 'الرقم أكبر من اللازم.' : "That number is too large to say.";
    return lang === 'ar' ? 'لم أفهم العملية الحسابية.' : "I couldn't follow that sum.";
  }
}
