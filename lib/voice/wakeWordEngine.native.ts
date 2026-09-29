import { Directory, File, Paths } from 'expo-file-system';
import {
  deleteModelFile,
  downloadWithSystem,
  findModelFile,
  hasPermanentStorage,
  hasSystemDownloader,
  type ModelFile,
} from '@/lib/inference/brainStore';
import { toInt16 } from './pcm';
import { isComplete, WAKE_MODEL_FILES, type WakeModelFile } from './wakeModelFiles';

/** What the voice hook needs from a wake-word engine: a frame in, "was it said?" out. */
export interface WakeWordEngine {
  process(frame: Float32Array): boolean;
  reset(): void;
}

function header(path: string): Uint8Array {
  try {
    return new File(path).bytesSync().subarray(0, 8);
  } catch {
    return new Uint8Array();
  }
}

/** The file in Download/JARVIS/models/voice/wakeword, fetched once by Android's downloader. */
async function permanentPath(model: WakeModelFile): Promise<string> {
  const file: ModelFile = { url: model.url, name: `voice/wakeword/${model.name}`, title: 'JARVIS wake word', minBytes: model.bytes };
  let found = findModelFile(file);
  if (found && !isComplete(model, found.size, header(found.path))) {
    deleteModelFile(found.path);
    found = null;
  }
  if (!found) {
    found = await downloadWithSystem(() => undefined, file);
    if (!isComplete(model, found.size, header(found.path))) {
      deleteModelFile(found.path);
      throw new Error(`WAKE_MODEL_INVALID:${model.name}`);
    }
  }
  return found.path.replace(/^file:\/\//, '');
}

/** Same, into app storage, when the permanent folder is not available yet. */
async function privatePath(model: WakeModelFile): Promise<string> {
  const dir = new Directory(Paths.document, 'wakeword');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  let file = new File(dir, model.name);
  if (!file.exists || !isComplete(model, file.size ?? 0, header(file.uri))) {
    if (file.exists) file.delete();
    const downloaded = await File.downloadFileAsync(model.url, file);
    file = new File(downloaded.uri);
    if (!isComplete(model, file.size ?? 0, header(file.uri))) {
      file.delete();
      throw new Error(`WAKE_MODEL_INVALID:${model.name}`);
    }
  }
  return file.uri.replace(/^file:\/\//, '');
}

/**
 * openWakeWord "hey jarvis" (Apache-2.0 code; the model weights are
 * CC BY-NC-SA: fine for the owner's personal use, not a commercial release).
 *
 * Returns null whenever it cannot run — no native module in this APK, no
 * network for the one-time 3.6 MB download, a damaged file, a load failure —
 * and the caller then keeps the existing path: "Jarvis" recognised in speech.
 * Nothing here may ever stop the assistant from working.
 */
export async function createWakeWordEngine(threshold = 0.5): Promise<WakeWordEngine | null> {
  try {
    const managed = hasSystemDownloader() && hasPermanentStorage();
    const paths: Record<string, string> = {};
    for (const model of WAKE_MODEL_FILES) paths[model.role] = await (managed ? permanentPath(model) : privatePath(model));
    // Required lazily so an APK without the native module still starts.
    const { Openwakeword } = require('react-native-openwakeword') as typeof import('react-native-openwakeword');
    const detector = await Openwakeword.createDetector({
      melspecPath: paths.melspec!,
      embeddingPath: paths.embedding!,
      wakeWordPath: paths.wakeWord!,
    });
    detector.setThreshold(threshold);
    return {
      process(frame) {
        const pcm = toInt16(frame);
        const buffer = pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength) as ArrayBuffer;
        return detector.processFrame(buffer).isDetected;
      },
      reset: () => detector.reset(),
    };
  } catch {
    return null;
  }
}
