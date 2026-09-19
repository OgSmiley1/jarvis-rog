export interface FreePortal {
  id: 'chatgpt' | 'gemini' | 'grok';
  name: string;
  description: string;
  url: string;
}

export const FREE_AI_PORTALS: FreePortal[] = [
  {
    id: 'chatgpt',
    name: 'ChatGPT Free',
    description: 'Official ChatGPT consumer web experience. Free-plan limits and availability are controlled by OpenAI.',
    url: 'https://chatgpt.com/',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    description: 'Official Gemini consumer web app. A supported Google account may be required.',
    url: 'https://gemini.google.com/',
  },
  {
    id: 'grok',
    name: 'Grok',
    description: 'Official Grok web app. xAI describes Grok as free to start; usage limits are account dependent.',
    url: 'https://grok.com/',
  },
];
