import { z } from 'zod';
import { captureFrame, describeFrame, eyesInstalled } from '@/lib/vision/eyes';
import { EYES_TOTAL_MB } from '@/lib/vision/eyesFiles';
import type { ToolDefinition } from './types';

/** The one tool that opens the camera, and only because the owner asked. */
export const visionTools: ToolDefinition[] = [
  {
    name: 'vision.look',
    description: 'Take one photo (from the live camera page if it is open, otherwise the owner takes it) and describe what is in it. Nothing leaves the phone.',
    target: 'ANDROID',
    confirmation: 'none',
    schema: z.object({ question: z.string().max(300).optional(), lang: z.enum(['en', 'ar']).default('en') }),
    execute: async ({ question, lang }) => {
      const ar = lang === 'ar';
      if (!eyesInstalled()) {
        return {
          speech: ar
            ? `عيوني غير مثبتة بعد. افتح الإعدادات ← العيون ونزّلها (${EYES_TOTAL_MB} ميجابايت).`
            : `My eyes aren't installed yet. Open Settings → Eyes to download them (${EYES_TOTAL_MB} MB).`,
        };
      }
      let uri: string | null;
      try {
        uri = await captureFrame();
      } catch (error) {
        if (error instanceof Error && error.message === 'CAMERA_PERMISSION_DENIED') {
          return { speech: ar ? 'أحتاج إذن الكاميرا لأرى.' : 'I need camera permission to see.' };
        }
        throw error;
      }
      if (!uri) return { speech: ar ? 'أُغلقت الكاميرا — لم أرَ شيئًا.' : 'Camera closed — nothing seen.' };
      const description = await describeFrame(uri, question);
      // The eyes model speaks English; say so rather than pretend.
      return { speech: ar ? `ما أراه (بالإنجليزية): ${description}` : description, private: true };
    },
  },
];
