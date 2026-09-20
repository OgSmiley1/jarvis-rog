/** Test-environment stand-in for `expo-speech`. See tests/stubs/react-native.ts. */
export function speak(): void {}
export function stop(): void {}
export async function isSpeakingAsync(): Promise<boolean> {
  return false;
}
