/** Test-environment stand-in for `expo-speech`. See tests/stubs/react-native.ts. */

/** Every utterance handed to the engine, in order. Tests read and reset it. */
export const spokenLog: string[] = [];

export function speak(text: string, options?: { onDone?: () => void }): void {
  spokenLog.push(text);
  options?.onDone?.();
}
export function stop(): void {}
export async function isSpeakingAsync(): Promise<boolean> {
  return false;
}
export async function getAvailableVoicesAsync(): Promise<never[]> {
  return [];
}
