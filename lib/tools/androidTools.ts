import { Linking } from 'react-native';
import { z } from 'zod';
import type { ToolDefinition } from './types';
import { speakResponse, stopSpeaking } from '@/lib/voice/voiceResponse';

export const androidTools: ToolDefinition[] = [
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
      speakResponse(text, language);
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
      stopSpeaking();
      return { speaking: false };
    },
  },
];
