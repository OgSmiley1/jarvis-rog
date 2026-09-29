export function useLiveVoice() {
  return {
    state: 'ERROR' as const,
    transcript: '',
    error: 'Native local voice is unavailable on web.',
    isReady: false,
    downloadProgress: 0,
    start: async () => {},
    stop: async () => {},
    clearTranscript: () => {},
    transcribe: async (_audio: Float32Array, _language: 'en' | 'ar') => '',
  };
}
