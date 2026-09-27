import * as Battery from 'expo-battery';
import { Linking } from 'react-native';
import { z } from 'zod';
import { phone } from '@/lib/device/phone';
import {
  calendarRange,
  describeBattery,
  describeCalls,
  describeEvents,
  describeMessages,
  describePermissionError,
  looksLikeNumber,
  matchApp,
  pickContact,
  type Lang,
} from '@/lib/device/phoneSpeech';
import type { ToolDefinition } from './types';

/**
 * Phone tools return `{ speech }` — the sentence JARVIS says — and
 * `private: true` when it contains the owner's messages, calls, contacts or
 * calendar, so the live test log and the cloud brain never see it.
 */
export interface PhoneToolData {
  speech: string;
  private?: boolean;
}

const lang = z.enum(['en', 'ar']).default('en');

/** Well-known apps whose label differs from what people say. */
export const APP_ALIASES: Record<string, string> = {
  gmail: 'com.google.android.gm',
  email: 'com.google.android.gm',
  whatsapp: 'com.whatsapp',
  chrome: 'com.android.chrome',
  browser: 'com.android.chrome',
  photos: 'com.google.android.apps.photos',
  gallery: 'com.google.android.apps.photos',
  'armoury crate': 'com.asus.gamecenter',
  'play store': 'com.android.vending',
  'واتساب': 'com.whatsapp',
  'واتس': 'com.whatsapp',
  'يوتيوب': 'com.google.android.youtube',
  'انستقرام': 'com.instagram.android',
  'انستا': 'com.instagram.android',
  'كروم': 'com.android.chrome',
};

async function guarded(language: Lang, run: () => Promise<PhoneToolData>): Promise<PhoneToolData> {
  try {
    return await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const permission = describePermissionError(message, language);
    if (permission) return { speech: permission };
    throw error;
  }
}

async function resolveNumber(who: string, language: Lang): Promise<{ number: string; name: string } | PhoneToolData> {
  if (looksLikeNumber(who)) return { number: who.trim(), name: who.trim() };
  let pick = pickContact(who, await phone().findContacts(who, 12));
  // Arabic attaches "to"/"with" to the name: «لأحمد», «بأحمد».
  if (pick.kind === 'none' && /^[لب]/u.test(who) && who.length > 2) {
    pick = pickContact(who.slice(1), await phone().findContacts(who.slice(1), 12));
  }
  if (pick.kind === 'none') {
    return { speech: language === 'ar' ? `لم أجد ${who} في جهات الاتصال.` : `I couldn't find ${who} in your contacts.`, private: true };
  }
  if (pick.kind === 'many') {
    return {
      speech:
        language === 'ar'
          ? `وجدت أكثر من شخص: ${pick.names.join('، ')}. قل الاسم كاملًا.`
          : `I found ${pick.names.join(', ')}. Say the full name.`,
      private: true,
    };
  }
  return { number: pick.contact.number, name: pick.contact.name };
}

export const phoneTools: ToolDefinition[] = [
  {
    name: 'phone.call',
    description: 'Open the dialler with a contact (by name) or a number filled in. The owner presses Call; JARVIS never places the call.',
    target: 'ANDROID',
    confirmation: 'none',
    schema: z.object({ who: z.string().min(1).max(80), lang }),
    execute: ({ who, lang: language }) =>
      guarded(language, async () => {
        const target = await resolveNumber(who, language);
        if ('speech' in target) return target;
        phone().placeCall(target.number);
        return {
          speech: language === 'ar' ? `فتحت الاتصال بـ ${target.name}. اضغط اتصال.` : `Dialer ready for ${target.name}. Tap Call.`,
          private: true,
        };
      }),
  },
  {
    name: 'phone.text',
    description: 'Open a text message to a contact or number with the words filled in. The owner presses Send.',
    target: 'ANDROID',
    confirmation: 'none',
    schema: z.object({ who: z.string().min(1).max(80), body: z.string().max(2000).optional(), lang }),
    execute: ({ who, body, lang: language }) =>
      guarded(language, async () => {
        const target = await resolveNumber(who, language);
        if ('speech' in target) return target;
        const query = body ? `?body=${encodeURIComponent(body)}` : '';
        await Linking.openURL(`sms:${encodeURIComponent(target.number)}${query}`);
        return {
          speech: language === 'ar' ? `الرسالة إلى ${target.name} جاهزة. اضغط إرسال.` : `Message to ${target.name} is ready. Tap Send.`,
          private: true,
        };
      }),
  },
  {
    name: 'phone.read_messages',
    description: 'Read the latest text messages aloud, unread first.',
    target: 'ANDROID',
    confirmation: 'none',
    schema: z.object({ lang }),
    execute: ({ lang: language }) =>
      guarded(language, async () => ({
        speech: describeMessages(await phone().recentMessages(15), Date.now(), language),
        private: true,
      })),
  },
  {
    name: 'phone.recent_calls',
    description: 'Say who called recently, or only the missed calls.',
    target: 'ANDROID',
    confirmation: 'none',
    schema: z.object({ missed: z.boolean().default(false), lang }),
    execute: ({ missed, lang: language }) =>
      guarded(language, async () => ({
        speech: describeCalls(await phone().recentCalls(25), Date.now(), language, missed),
        private: true,
      })),
  },
  {
    name: 'phone.calendar',
    description: "Read the owner's calendar for today, tomorrow or this week.",
    target: 'ANDROID',
    confirmation: 'none',
    schema: z.object({ span: z.enum(['today', 'tomorrow', 'week']).default('today'), lang }),
    execute: ({ span, lang: language }) =>
      guarded(language, async () => {
        const { start, end } = calendarRange(span, Date.now());
        return { speech: describeEvents(await phone().calendarEvents(start, end, 20), span, Date.now(), language), private: true };
      }),
  },
  {
    name: 'phone.add_event',
    description: 'Open the calendar with a new event filled in (title, ISO start time, length in minutes). The owner saves it.',
    target: 'ANDROID',
    confirmation: 'none',
    schema: z.object({ title: z.string().min(1).max(200), start: z.string().datetime({ offset: true }), minutes: z.number().int().min(5).max(1440).default(60) }),
    execute: async ({ title, start, minutes }) => {
      const begin = Date.parse(start);
      phone().addCalendarEvent(title, begin, begin + minutes * 60_000);
      return { speech: `New event "${title}" is ready in your calendar. Tap Save.` };
    },
  },
  {
    name: 'phone.open_app',
    description: 'Open any installed app by its name.',
    target: 'ANDROID',
    confirmation: 'none',
    schema: z.object({ name: z.string().min(1).max(80), lang }),
    execute: async ({ name, lang: language }) => {
      const app = matchApp(name, await phone().installedApps(), APP_ALIASES);
      if (!app || !phone().openApp(app.package)) {
        return { speech: language === 'ar' ? `لم أجد تطبيقًا باسم ${name}.` : `I couldn't find an app called ${name}.` };
      }
      return { speech: language === 'ar' ? `فتحت ${app.label}.` : `Opened ${app.label}.` };
    },
  },
  {
    name: 'phone.web_search',
    description: 'Search the web in the browser.',
    target: 'ANDROID',
    confirmation: 'none',
    schema: z.object({ query: z.string().min(1).max(300), lang }),
    execute: async ({ query, lang: language }) => {
      await Linking.openURL(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
      return { speech: language === 'ar' ? `بحثت عن ${query}.` : `Searching for ${query}.` };
    },
  },
  {
    name: 'phone.battery',
    description: 'Say the battery level and whether the phone is charging.',
    target: 'ANDROID',
    confirmation: 'none',
    schema: z.object({ lang }),
    execute: async ({ lang: language }) => {
      const [level, state] = await Promise.all([Battery.getBatteryLevelAsync(), Battery.getBatteryStateAsync()]);
      const charging = state === Battery.BatteryState.CHARGING || state === Battery.BatteryState.FULL;
      return { speech: describeBattery(level >= 0 ? level : null, charging, language) };
    },
  },
];
