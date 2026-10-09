import { Linking } from 'react-native';
import { z } from 'zod';
import { describeDuration } from '@/lib/utils/durations';
import { createId } from '@/lib/utils/ids';
import { makeQr } from './localExtras';
import type { ToolDefinition } from './types';

/**
 * Device actions and local utilities. Each reports what actually happened:
 * a timer handed to the Clock app is "asked the Clock app", not "your timer
 * is running" — JARVIS cannot see inside another app.
 */

const lang = z.enum(['en', 'ar']).default('en');

/** Settings panels Android lets any app open. Restricted toggles need the owner's own tap. */
export const SETTINGS_PANELS = {
  wifi: 'android.settings.WIFI_SETTINGS',
  bluetooth: 'android.settings.BLUETOOTH_SETTINGS',
  battery: 'android.settings.BATTERY_SAVER_SETTINGS',
  display: 'android.settings.DISPLAY_SETTINGS',
  sound: 'android.settings.SOUND_SETTINGS',
  location: 'android.settings.LOCATION_SOURCE_SETTINGS',
  airplane: 'android.settings.AIRPLANE_MODE_SETTINGS',
  notifications: 'android.settings.NOTIFICATION_SETTINGS',
  data: 'android.settings.DATA_USAGE_SETTINGS',
} as const;
export type SettingsPanel = keyof typeof SETTINGS_PANELS;

const PANEL_NAMES: Record<SettingsPanel, [string, string]> = {
  wifi: ['Wi-Fi', 'الواي فاي'],
  bluetooth: ['Bluetooth', 'البلوتوث'],
  battery: ['Battery saver', 'توفير البطارية'],
  display: ['Display', 'الشاشة'],
  sound: ['Sound', 'الصوت'],
  location: ['Location', 'الموقع'],
  airplane: ['Airplane mode', 'وضع الطيران'],
  notifications: ['Notifications', 'الإشعارات'],
  data: ['Mobile data', 'بيانات الجوال'],
};

async function phoneModule() {
  const { isPhoneAccessSupported, phone } = await import('@/lib/device/phone');
  return isPhoneAccessSupported() ? phone() : null;
}

export const localTools: ToolDefinition[] = [
  {
    name: 'local.timer',
    description: 'Start a countdown timer in the Clock app.',
    target: 'ANDROID',
    confirmation: 'none',
    schema: z.object({ seconds: z.number().int().min(1).max(86_400), label: z.string().max(60).default('JARVIS'), lang }),
    execute: async ({ seconds, label, lang: language }) => {
      const native = await phoneModule();
      const outcome = native?.setTimer?.(seconds, label) ?? 'unavailable';
      const span = describeDuration(seconds, language);
      if (outcome === 'dispatched') {
        return { speech: language === 'ar' ? `طلبت من تطبيق الساعة مؤقّتًا لمدة ${span}.` : `I've asked the Clock app for a ${span} timer.`, outcome };
      }
      if (outcome === 'no-clock-app') {
        return { speech: language === 'ar' ? 'لا يوجد تطبيق ساعة يقبل المؤقتات.' : "No Clock app on this phone accepts timers.", outcome };
      }
      return { speech: language === 'ar' ? 'المؤقّت يحتاج نسخة أحدث من التطبيق.' : 'Timers need the newer app build.', outcome };
    },
  },
  {
    name: 'local.alarm',
    description: 'Set an alarm in the Clock app.',
    target: 'ANDROID',
    confirmation: 'none',
    schema: z.object({ hour: z.number().int().min(0).max(23), minute: z.number().int().min(0).max(59), label: z.string().max(60).default('JARVIS'), lang }),
    execute: async ({ hour, minute, label, lang: language }) => {
      const native = await phoneModule();
      const outcome = native?.setAlarm?.(hour, minute, label) ?? 'unavailable';
      const time = `${hour}:${String(minute).padStart(2, '0')}`;
      if (outcome === 'dispatched') {
        return { speech: language === 'ar' ? `طلبت من تطبيق الساعة منبّهًا الساعة ${time}.` : `I've asked the Clock app for an alarm at ${time}.`, outcome };
      }
      return {
        speech: language === 'ar' ? 'لم أستطع ضبط المنبّه من هنا.' : "I couldn't set that alarm from here.",
        outcome,
      };
    },
  },
  {
    name: 'local.show_timers',
    description: 'Open the Clock app\'s timers.',
    target: 'ANDROID',
    confirmation: 'none',
    schema: z.object({ lang }),
    execute: async ({ lang: language }) => {
      const native = await phoneModule();
      const opened = native?.showTimers?.() ?? false;
      return { speech: opened ? (language === 'ar' ? 'فتحت المؤقتات.' : 'Timers are open.') : language === 'ar' ? 'لم أستطع فتح المؤقتات.' : "I couldn't open the timers." };
    },
  },
  {
    name: 'local.qr',
    description: 'Make a QR code on the phone for a link or text. Nothing is uploaded.',
    target: 'ANDROID',
    confirmation: 'none',
    schema: z.object({ text: z.string().min(1).max(1200), lang }),
    execute: async ({ text, lang: language }) => {
      const qr = makeQr(text);
      if (!qr) return { speech: language === 'ar' ? 'النص طويل جدًا لرمز QR.' : 'That is too long for a QR code.' };
      return { speech: language === 'ar' ? 'رمز QR جاهز على الشاشة.' : 'Your QR code is on screen.', qr, source: 'on-device' };
    },
  },
  {
    name: 'local.note_add',
    description: 'Save a short note on the phone.',
    target: 'ANDROID',
    confirmation: 'none',
    schema: z.object({ text: z.string().min(1).max(2000), lang }),
    execute: async ({ text, lang: language }) => {
      const { upsertMemory } = await import('@/lib/storage/database');
      const now = Date.now();
      await upsertMemory({
        id: createId('note'),
        title: text.slice(0, 60),
        body: text,
        type: 'note',
        source: 'manual',
        approved: true,
        pinned: false,
        tags: ['voice-note'],
        createdAt: now,
        updatedAt: now,
      });
      return { speech: language === 'ar' ? 'حفظت الملاحظة.' : 'Noted.', private: true };
    },
  },
  {
    name: 'local.notes_read',
    description: 'Read back the latest saved notes.',
    target: 'ANDROID',
    confirmation: 'none',
    schema: z.object({ lang }),
    execute: async ({ lang: language }) => {
      const { listMemories } = await import('@/lib/storage/database');
      const notes = (await listMemories()).filter((m) => m.type === 'note').slice(0, 5);
      if (notes.length === 0) return { speech: language === 'ar' ? 'لا توجد ملاحظات.' : 'You have no notes.', private: true };
      const list = notes.map((n) => n.body.slice(0, 120)).join(language === 'ar' ? '. ' : '. ');
      return {
        speech: language === 'ar' ? `آخر ملاحظاتك: ${list}.` : `Your latest notes: ${list}.`,
        private: true,
      };
    },
  },
  {
    name: 'device.settings_panel',
    description: 'Open an Android settings page (Wi-Fi, Bluetooth, battery, display, sound, location, airplane mode…).',
    target: 'ANDROID',
    confirmation: 'none',
    schema: z.object({ panel: z.enum(Object.keys(SETTINGS_PANELS) as [SettingsPanel, ...SettingsPanel[]]), lang }),
    execute: async ({ panel, lang: language }) => {
      const [en, ar] = PANEL_NAMES[panel as SettingsPanel];
      try {
        await Linking.sendIntent(SETTINGS_PANELS[panel as SettingsPanel]);
      } catch {
        await Linking.openSettings();
        return { speech: language === 'ar' ? `فتحت الإعدادات. اختر ${ar} من هناك.` : `Settings are open — pick ${en} from there.` };
      }
      return { speech: language === 'ar' ? `فتحت إعدادات ${ar}. التغيير بلمستك أنت.` : `${en} settings are open. The switch is yours to flip.` };
    },
  },
];
