/**
 * Audio format helpers. The recorder delivers 16 kHz mono float in [-1, 1];
 * the wake-word engine wants signed 16-bit PCM. No imports: unit-tested.
 */
export function toInt16(frame: Float32Array): Int16Array {
  const out = new Int16Array(frame.length);
  for (let i = 0; i < frame.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, frame[i]!));
    out[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return out;
}
