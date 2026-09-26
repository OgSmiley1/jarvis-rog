import type { ModelFile } from '@/lib/inference/brainStore';

/**
 * JARVIS's eyes: SmolVLM2-500M (Hugging Face, Apache-2.0) and its image
 * projector, about 546 MB together. Small on purpose — it has to describe a
 * photo in seconds on the phone, alongside the 4B brain, with nothing sent anywhere.
 */
const REPO = 'https://huggingface.co/ggml-org/SmolVLM2-500M-Video-Instruct-GGUF/resolve/main';

export const EYES_MODEL: ModelFile = {
  url: `${REPO}/SmolVLM2-500M-Video-Instruct-Q8_0.gguf?download=true`,
  name: 'SmolVLM2-500M-Video-Instruct-Q8_0.gguf',
  title: 'JARVIS eyes (SmolVLM2)',
  minBytes: 400_000_000,
};

export const EYES_PROJECTOR: ModelFile = {
  url: `${REPO}/mmproj-SmolVLM2-500M-Video-Instruct-Q8_0.gguf?download=true`,
  name: 'mmproj-SmolVLM2-500M-Video-Instruct-Q8_0.gguf',
  title: 'JARVIS eyes projector (SmolVLM2)',
  minBytes: 100_000_000,
};

export const EYES_TOTAL_MB = 546;

/** The instruction the eyes get: short, concrete, spoken-friendly. */
export function visionPrompt(question?: string): string {
  const ask = question?.trim();
  return ask && !/^(what do you see|what('s| is) this|look( at this)?|describe( this)?)\??$/i.test(ask)
    ? `${ask} Answer in one or two short spoken sentences.`
    : 'Describe what is in this photo in one or two short spoken sentences. Name the main objects and any readable text.';
}
