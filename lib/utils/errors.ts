export function errorMessage(error: unknown, fallback = 'UNKNOWN_ERROR'): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}

export function humanizeError(code: string): string {
  // The cloud brain reports every provider it tried; keep that detail, but
  // lead with what the owner can do about it.
  if (code.startsWith('CLOUD_ALL_FAILED:')) {
    return `No cloud brain answered —${code.slice('CLOUD_ALL_FAILED:'.length)}. Check the keys in Settings, or download the local brain so JARVIS does not need the internet.`;
  }

  const known: Record<string, string> = {
    MODEL_NOT_LOADED: 'No brain is loaded yet. Tap "Download JARVIS brain" on the main screen, or add a free cloud key in Settings.',
    CLOUD_NO_KEYS: 'The cloud brain is on, but no provider key is saved. Add a free Groq, Cerebras or Gemini key in Settings.',
    CLOUD_KEY_EMPTY: 'Paste the key before saving it.',
    NO_MODEL_SELECTED: 'Import a GGUF model first.',
    MODEL_EXTENSION_INVALID: 'The selected file is not a .gguf model.',
    MODEL_COPY_VERIFICATION_FAILED: 'The model copy could not be verified.',
    MODEL_INSUFFICIENT_STORAGE: 'Free some storage space first. The recommended local brain needs about 3.5 GB free.',
    MODEL_DOWNLOAD_CANCELLED: 'The local brain download was cancelled.',
    MODEL_DOWNLOAD_VERIFICATION_FAILED: 'The downloaded local brain could not be verified.',
    MODEL_DOWNLOAD_SIZE_INVALID: 'The model download was incomplete. Try the download again.',
    NATIVE_INFERENCE_UNAVAILABLE_ON_WEB: 'Local GGUF inference is available in the Android build, not the web preview.',
    TERMUX_NOT_CONFIGURED: 'Add the Termux bridge secret in Settings first.',
    CONFIRMATION_REQUIRED: 'This action requires confirmation before it can run.',
    EMPTY_MESSAGE: 'Type a message first.',
  };
  return known[code] ?? code;
}
