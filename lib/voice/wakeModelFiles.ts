/**
 * openWakeWord "hey jarvis": three small TensorFlow Lite files (≈3.6 MB),
 * fetched once from the project's own release and kept in app storage (the
 * engine needs real file paths, not compressed APK assets). The code is
 * Apache-2.0; the model weights are CC BY-NC-SA — fine for the owner's
 * personal use, not for a commercial release. No native imports: unit-tested.
 */

const RELEASE = 'https://github.com/dscripka/openWakeWord/releases/download/v0.5.1';

export interface WakeModelFile {
  role: 'melspec' | 'embedding' | 'wakeWord';
  name: string;
  url: string;
  /** Exact size of the published file, a cheap integrity check. */
  bytes: number;
}

export const WAKE_MODEL_FILES: WakeModelFile[] = [
  { role: 'melspec', name: 'melspectrogram.tflite', url: `${RELEASE}/melspectrogram.tflite`, bytes: 1_092_516 },
  { role: 'embedding', name: 'embedding_model.tflite', url: `${RELEASE}/embedding_model.tflite`, bytes: 1_330_312 },
  { role: 'wakeWord', name: 'hey_jarvis_v0.1.tflite', url: `${RELEASE}/hey_jarvis_v0.1.tflite`, bytes: 1_278_912 },
];

/** A TFLite flatbuffer carries "TFL3" at bytes 4–7. */
export function looksLikeTflite(header: Uint8Array): boolean {
  return header.length >= 8 && header[4] === 0x54 && header[5] === 0x46 && header[6] === 0x4c && header[7] === 0x33;
}

export function isComplete(file: WakeModelFile, size: number, header: Uint8Array): boolean {
  return size === file.bytes && looksLikeTflite(header);
}
