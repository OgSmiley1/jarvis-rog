export function useLiveVoice() {
  return {
    state: 'ERROR' as const,
    transcript: '',
    error: 'Native local voice is unavailable on web.',
    level: 0,
    isReady: false,
    downloadProgress: 0,
    start: async () => {},
    stop: async () => {},
    clearTranscript: () => {},
  };
}
