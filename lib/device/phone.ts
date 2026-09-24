import { requireOptionalNativeModule } from 'expo';
import type { CalendarEvent, CallEntry, Contact, InstalledApp, Message } from '@/lib/device/phoneSpeech';

/** See modules/expo-jarvis-phone. Null on web and in APKs built before it existed. */
interface ExpoJarvisPhoneNativeModule {
  hasPermission(permission: string): boolean;
  findContacts(query: string, limit: number): Promise<Contact[]>;
  placeCall(number: string): 'calling' | 'dialer';
  recentMessages(limit: number): Promise<Message[]>;
  recentCalls(limit: number): Promise<CallEntry[]>;
  calendarEvents(startMs: number, endMs: number, limit: number): Promise<CalendarEvent[]>;
  addCalendarEvent(title: string, startMs: number, endMs: number): boolean;
  installedApps(): Promise<InstalledApp[]>;
  openApp(packageName: string): boolean;
}

const native = requireOptionalNativeModule<ExpoJarvisPhoneNativeModule>('ExpoJarvisPhone');

export function phone(): ExpoJarvisPhoneNativeModule {
  if (!native) throw new Error('PHONE_ACCESS_UNAVAILABLE');
  return native;
}

export function isPhoneAccessSupported(): boolean {
  return native !== null;
}
