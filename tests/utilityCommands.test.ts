import { describe, expect, it } from 'vitest';
import { routeDeterministicTool } from '@/lib/tools/deterministicRouter';
import { describeCalculation, evaluate, extractExpression, formatNumber } from '@/lib/utils/voiceMath';
import { describeSystemStatus } from '@/lib/device/systemStatus';
import { describeTime } from '@/lib/tools/utilityTools';
import { detectLanguageSwitch, isShareCommand } from '@/lib/hud/hudCommands';
import { ThermalStatus } from '@/lib/inference/thermalPlan';

const route = (text: string) => {
  const found = routeDeterministicTool(text);
  return found ? { tool: found.call.tool, args: found.call.arguments, said: found.successMessage } : null;
};

describe('the video-2 commands, routed without the brain', () => {
  it.each([
    ['Jarvis, what is the time', 'utility.time'],
    ["what's the date", 'utility.time'],
    ['كم الساعة', 'utility.time'],
    ['give me the system information', 'utility.system_status'],
    ['معلومات النظام', 'utility.system_status'],
    ['calculate 200 + 400 + 300', 'utility.calculate'],
    ['400 plus 300', 'utility.calculate'],
    ['احسب ٤٠٠ زائد ٣٠٠', 'utility.calculate'],
  ])('%s → %s', (text, tool) => {
    expect(route(text)?.tool).toBe(tool);
  });

  it('date vs time', () => {
    expect(route('what day is it')?.args).toEqual({ what: 'date', lang: 'en' });
    expect(route('time and date')?.args).toEqual({ what: 'both', lang: 'en' });
  });

  it('site searches go to that site, and say they need the internet', () => {
    const youtube = route('search pizza in dubai on youtube');
    expect(youtube?.tool).toBe('device.open_url');
    expect(youtube?.args).toEqual({ url: 'https://www.youtube.com/results?search_query=pizza%20in%20dubai' });
    expect(youtube?.said).toContain('internet');
    expect(route('look up Albert Einstein on wikipedia')?.args).toEqual({
      url: 'https://en.wikipedia.org/w/index.php?search=albert%20einstein',
    });
    expect(route('ابحث عن مطعم في يوتيوب')?.args).toEqual({
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent('مطعم')}`,
    });
  });

  it('"open youtube website" is the browser; bare "open youtube" is still the app', () => {
    expect(route('open youtube website')?.args).toEqual({ url: 'https://www.youtube.com' });
    expect(route('open youtube')?.tool).toBe('phone.open_app');
  });

  it('a plain web search still works', () => {
    expect(route('search for best shawarma')?.tool).toBe('phone.web_search');
  });

  it('questions that merely contain numbers are left to the brain', () => {
    expect(route('what is AI')).toBeNull();
    expect(route('tell me about the 1969 moon landing and 2 astronauts')).toBeNull();
  });
});

describe('voice maths', () => {
  it.each([
    ['calculate 200 + 400 + 300', 900],
    ['400 plus 300', 700],
    ['what is 12 times 7', 84],
    ['2 plus 3 times 4', 14],
    ['(2 plus 3) times 4', 20],
    ['2 to the power of 10', 1024],
    ['10 divided by 4', 2.5],
    ['20 percent of 350', 70],
    ['100 minus 250', -150],
    ['احسب ٤٠٠ زائد ٣٠٠', 700],
    ['كم ٦ ضرب ٧', 42],
    ['1,000 plus 250', 1250],
  ])('%s = %s', (text, expected) => {
    const expression = extractExpression(text);
    expect(expression).not.toBeNull();
    expect(evaluate(expression!)).toBeCloseTo(expected, 9);
  });

  it('repairs a mis-heard first word ("red" for "add")', () => {
    expect(evaluate(extractExpression('red + 400 + 300')!)).toBe(700);
  });

  it('refuses what it cannot do safely', () => {
    expect(describeCalculation('5 / 0', 'en')).toBe("That divides by zero, so there's no answer.");
    expect(describeCalculation('2 ^ 999', 'en')).toBe('That number is too large to say.');
    expect(() => evaluate('2 +')).toThrow();
  });

  it('speaks clean numbers', () => {
    expect(formatNumber(1 / 3)).toBe('0.333333');
    expect(formatNumber(-0)).toBe('0');
    expect(describeCalculation('200 + 400 + 300', 'en')).toBe('200 + 400 + 300 is 900.');
    expect(describeCalculation('6 * 7', 'ar')).toBe('6 × 7 يساوي 42.');
  });
});

describe('time, date and system report', () => {
  const at = new Date(2026, 8, 26, 15, 5);
  it('time and date sentences', () => {
    expect(describeTime('time', at, 'en')).toBe("It's 3:05 PM.");
    expect(describeTime('date', at, 'en')).toBe('Today is Saturday 26 September.');
    expect(describeTime('time', at, 'ar')).toBe('الساعة 3:05 مساءً.');
  });

  it('reports only what the phone measured', () => {
    expect(
      describeSystemStatus(
        { batteryLevel: 0.64, charging: true, totalRamGb: 15.4, thermalStatus: ThermalStatus.None, freeStorageGb: 212.37, brain: 'ready', brainName: 'Qwen3 4B' },
        'en',
      ),
    ).toBe('Battery 64%, charging. Memory 15.4 GB. Temperature: cool. Storage 212.4 GB free. And Qwen3 4B is loaded.');
    const unknown = describeSystemStatus({ brain: 'none' }, 'en');
    expect(unknown).toContain('Battery unknown');
    expect(unknown).not.toMatch(/CPU/);
  });
});

describe('app-level commands', () => {
  it('switches language both ways', () => {
    expect(detectLanguageSwitch('Jarvis, change language to Arabic')).toBe('ar');
    expect(detectLanguageSwitch('غيّر اللغة إلى الإنجليزية')).toBe('en');
    expect(detectLanguageSwitch('speak english')).toBe('en');
    expect(detectLanguageSwitch('change language to sinhala')).toBeNull();
  });
  it('recognises share requests', () => {
    expect(isShareCommand('share that')).toBe(true);
    expect(isShareCommand('send it to whatsapp')).toBe(true);
    expect(isShareCommand('write this into notes')).toBe(true);
    expect(isShareCommand('send a message to Sara')).toBe(false);
  });
});
