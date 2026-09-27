export function eyesInstalled(): boolean {
  return false;
}
export async function captureFrame(): Promise<string | null> {
  throw new Error('EYES_UNAVAILABLE_ON_WEB');
}
export async function describeFrame(): Promise<string> {
  throw new Error('EYES_UNAVAILABLE_ON_WEB');
}
