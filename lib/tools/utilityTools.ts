import { z } from 'zod';
import { describeSystemStatus } from '@/lib/device/systemStatus';
import { clockTime } from '@/lib/device/phoneSpeech';
import { formatClock } from '@/lib/hud/dashboard';
import { describeCalculation } from '@/lib/utils/voiceMath';
import type { ToolDefinition } from './types';

const lang = z.enum(['en', 'ar']).default('en');

/** Brain status is owned by the app context; it registers a reader here at start-up. */
let brainReader: () => { brain: 'ready' | 'loading' | 'none' | 'cloud'; name?: string } = () => ({ brain: 'none' });
export function setBrainReader(reader: typeof brainReader): void {
  brainReader = reader;
}

export function describeTime(what: 'time' | 'date' | 'both', now: Date, language: 'en' | 'ar'): string {
  const { date } = formatClock(now, language);
  const time = clockTime(now.getTime(), language);
  const niceDate = language === 'ar' ? date : date.charAt(0) + date.slice(1).toLowerCase().replace(/ (\w)/g, (m) => m.toUpperCase());
  if (what === 'time') return language === 'ar' ? `الساعة ${time}.` : `It's ${time}.`;
  if (what === 'date') return language === 'ar' ? `اليوم ${date}.` : `Today is ${niceDate}.`;
  return language === 'ar' ? `الساعة ${time}، اليوم ${date}.` : `It's ${time} on ${niceDate}.`;
}

/** The video-2 desk-assistant basics, done on the phone, offline, free. */
export const utilityTools: ToolDefinition[] = [
  {
    name: 'utility.time',
    description: 'Say the current time, date, or both, from the phone clock.',
    target: 'ANDROID',
    confirmation: 'none',
    schema: z.object({ what: z.enum(['time', 'date', 'both']).default('time'), lang }),
    execute: async ({ what, lang: language }) => ({ speech: describeTime(what, new Date(), language) }),
  },
  {
    name: 'utility.calculate',
    description: 'Work out arithmetic exactly, offline (+ − × ÷, powers, brackets, percentages).',
    target: 'ANDROID',
    confirmation: 'none',
    schema: z.object({ expression: z.string().min(1).max(300), lang }),
    execute: async ({ expression, lang: language }) => ({ speech: describeCalculation(expression, language) }),
  },
  {
    name: 'utility.system_status',
    description: 'Report battery, memory, temperature, free storage and whether the brain is loaded.',
    target: 'ANDROID',
    confirmation: 'none',
    schema: z.object({ lang }),
    execute: async ({ lang: language }) => {
      // Native readers load only when asked, keeping the tool list importable anywhere.
      const { readDevicePowerState } = await import('@/lib/device/powerState');
      const reading = await readDevicePowerState();
      let freeStorageGb: number | undefined;
      try {
        const { Paths } = await import('expo-file-system');
        freeStorageGb = Paths.availableDiskSpace / 1024 ** 3;
      } catch {
        freeStorageGb = undefined;
      }
      const brain = brainReader();
      return {
        speech: describeSystemStatus(
          { ...reading.state, freeStorageGb, brain: brain.brain, brainName: brain.name },
          language,
        ),
      };
    },
  },
];
