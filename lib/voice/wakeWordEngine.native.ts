import { Directory, File, Paths } from 'expo-file-system';
import { isComplete, WAKE_MODEL_FILES } from './wakeModelFiles';

/** What the loop needs from a wake-word engine: 16-bit PCM in, detected or not out. */
export interface WakeWordEngine {
  process(pcm: Int16Array): { detected: boolean; probability: number };
  reset(): void;
}

function header(file: File): Uint8Array {
  try {
    return file.bytesSync().subarray(0, 8);
  } catch {
    return new Uint8Array();
  }
}

/** The three model files on the phone, downloading what is missing (once). */
async function ensureModels(): Promise<Record<string, string>> {
  const dir = new Directory(Paths.document, 'wakeword');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const paths: Record<string, string> = {};
  for (const model of WAKE_MODEL_FILES) {
    let file = new File(dir, model.name);
    if (!file.exists || !isComplete(model, file.size ?? 0, header(file))) {
      if (file.exists) file.delete();
      const downloaded = await File.downloadFileAsync(model.url, file);
      file = new File(downloaded.uri);
      if (!isComplete(model, file.size ?? 0, header(file))) {
        file.delete();
        throw new Error(`WAKE_MODEL_INVALID:${model.name}`);
      }
    }
    paths[model.role] = file.uri.replace(/^file:\/\//, '');
  }
  return paths;
}

/**
 * openWakeWord "hey jarvis", or null when it cannot run here (no native
 * module in this APK, no network for the first download, a bad file). The
 * loop then falls back to hearing "Jarvis" at the start of an utterance.
 */
export async function createWakeWordEngine(threshold = 0.5): Promise<WakeWordEngine | null> {
  try {
    const paths = await ensureModels();
    // Required lazily: an APK without the native module must still start.
    const { Openwakeword } = require('react-native-openwakeword') as typeof import('react-native-openwakeword');
    const detector = await Openwakeword.createDetector({
      melspecPath: paths.melspec!,
      embeddingPath: paths.embedding!,
      wakeWordPath: paths.wakeWord!,
    });
    detector.setThreshold(threshold);
    return {
      process(pcm) {
        const result = detector.processFrame(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength) as ArrayBuffer);
        return { detected: result.isDetected, probability: result.probability };
      },
      reset: () => detector.reset(),
    };
  } catch {
    return null;
  }
}
