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
