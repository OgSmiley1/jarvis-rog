/**
 * Test-environment stand-in for `expo-speech`. See tests/stubs/react-native.ts.
 * Records what would have been spoken, so tests can assert on the exact text
 * that reaches the speaker.
 */
export const spokenLog: Array<{ text: string; options?: unknown }> = [];
export let stopCount = 0;

export function speak(text: string, options?: unknown): void {
  spokenLog.push({ text, options });
}
export function stop(): void {
  stopCount += 1;
}
export async function getAvailableVoicesAsync(): Promise<unknown[]> {
  return [];
}
export async function isSpeakingAsync(): Promise<boolean> {
  return false;
}
/** Test helper: forget everything recorded so far. */
export function resetSpeech(): void {
  spokenLog.length = 0;
  stopCount = 0;
}
