export function errorMessage(error: unknown, fallback = 'UNKNOWN_ERROR'): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}

export function humanizeError(code: string): string {
  const known: Record<string, string> = {
    MODEL_NOT_LOADED: 'Load a GGUF model before asking JARVIS to reason.',    NO_MODEL_SELECTED: 'Import a GGUF model first.',
    MODEL_EXTENSION_INVALID: 'The selected file is not a .gguf model.',
    MODEL_COPY_VERIFICATION_FAILED: 'The model copy could not be verified.',
    NATIVE_INFERENCE_UNAVAILABLE_ON_WEB: 'Local GGUF inference is available in the Android build, not the web preview.',
    TERMUX_NOT_CONFIGURED: 'Add the Termux bridge secret in Settings first.',
    CONFIRMATION_REQUIRED: 'This action requires confirmation before it can run.',
    EMPTY_MESSAGE: 'Type a message first.',
  };
  return known[code] ?? code;
}
