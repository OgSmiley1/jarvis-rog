import { Linking } from 'react-native';
import { z } from 'zod';
import type { ToolDefinition } from './types';
import { speakResponse, stopSpeaking } from '@/lib/voice/voiceResponse';

export const androidTools: ToolDefinition[] = [
  {
    name: 'device.open_map_search',
    description: 'Open the device maps experience and search for a place requested by the owner.',
    target: 'ANDROID',
    confirmation: 'none',
    schema: z.object({ query: z.string().min(1).max(300) }),
    execute: async ({ query }) => {
      const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query.trim())}`;
      await Linking.openURL(url);
      return { opened: true, query };
    },
  },
  {
    name: 'device.compose_email',
    description: 'Open the device email composer with optional recipient, subject and body. This does not silently press Send.',
    target: 'ANDROID',
    confirmation: 'none',
    schema: z.object({
      to: z.string().email().optional(),
      subject: z.string().max(300).optional(),
      body: z.string().max(10000).optional(),
    }),
    execute: async ({ to, subject, body }) => {
      const params: string[] = [];
      if (subject) params.push(`subject=${encodeURIComponent(subject)}`);
      if (body) params.push(`body=${encodeURIComponent(body)}`);
      const url = `mailto:${to ?? ''}${params.length ? `?${params.join('&')}` : ''}`;
      await Linking.openURL(url);
      return { opened: true, to: to ?? null };
    },
  },
  {
    name: 'device.open_url',
    description: 'Open a user-requested http or https URL.',
    target: 'ANDROID',
    confirmation: 'none',
    schema: z.object({ url: z.string().url().refine((url) => /^https?:\/\//i.test(url), 'Only HTTP(S) URLs are allowed') }),
    execute: async ({ url }) => {
      const supported = await Linking.canOpenURL(url);
      if (!supported) throw new Error('URL_NOT_SUPPORTED');
      await Linking.openURL(url);
      return { opened: true, url };
    },
  },
  {
    name: 'device.open_settings',
    description: 'Open this application settings page.',
    target: 'ANDROID',
    confirmation: 'none',
    schema: z.object({}),
    execute: async () => {
      await Linking.openSettings();
      return { opened: true };
    },
  },
  {
    name: 'device.open_camera',
    description: 'Open the Android camera in still-image mode. JARVIS does not capture or upload a photo by itself.',
    target: 'ANDROID',
    confirmation: 'none',
    schema: z.object({}),
    execute: async () => {
      await Linking.sendIntent('android.media.action.STILL_IMAGE_CAMERA');
      return { opened: true };
    },
  },
  {
    name: 'device.open_dialer',
    description: 'Open the phone dialer with an optional number. This does not place the call.',
    target: 'ANDROID',
    confirmation: 'none',
    schema: z.object({ number: z.string().max(40).optional() }),
    execute: async ({ number }) => {
      const cleaned = number?.trim();
      const url = cleaned ? `tel:${encodeURIComponent(cleaned)}` : 'tel:';
      await Linking.openURL(url);
      return { opened: true, number: cleaned ?? null, callPlaced: false };
    },
  },
  {
    name: 'device.compose_sms',
    description: 'Open the SMS composer with optional number and message. This never presses Send.',
    target: 'ANDROID',
    confirmation: 'none',
    schema: z.object({
      number: z.string().max(40).optional(),
      body: z.string().max(5000).optional(),
    }),
    execute: async ({ number, body }) => {
      const target = number?.trim() ?? '';
      const query = body ? `?body=${encodeURIComponent(body)}` : '';
      await Linking.openURL(`sms:${target}${query}`);
      return { opened: true, number: target || null, sent: false };
    },
  },
  {
    name: 'device.open_wifi_settings',
    description: 'Open Android Wi-Fi settings without changing connectivity automatically.',
    target: 'ANDROID',
    confirmation: 'none',
    schema: z.object({}),
    execute: async () => {
      await Linking.sendIntent('android.settings.WIFI_SETTINGS');
      return { opened: true };
    },
  },
  {
    name: 'assistant.speak',
    description: 'Speak text using the device text-to-speech engine.',
    target: 'ANDROID',
    confirmation: 'none',
    schema: z.object({ text: z.string().min(1).max(5000), language: z.enum(['en', 'ar']).default('en') }),
    execute: async ({ text, language }) => {
      await speakResponse(text, language);
      return { speaking: true };
    },
  },
  {
    name: 'assistant.stop_speaking',
    description: 'Stop current device text-to-speech playback.',
    target: 'ANDROID',
    confirmation: 'none',
    schema: z.object({}),
    execute: async () => {
      await stopSpeaking();
      return { speaking: false };
    },
  },
];
