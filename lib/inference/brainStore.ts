import { requireOptionalNativeModule } from 'expo';
import { File, Paths } from 'expo-file-system';
import {
  describeDownload,
  MIN_COMPLETE_MODEL_BYTES,
  MIN_IMPORTED_MODEL_BYTES,
  modelFileName,
  pickInstalledModel,
  type DownloadView,
  type InstalledModel,
  type ModelCandidate,
  type NativeDownloadStatus,
} from '@/lib/inference/brainPresence';
import { RECOMMENDED_MODEL } from '@/lib/inference/modelImport';

interface ExpoJarvisBrainNativeModule {
  modelDirectory(): string | null;
  fileSize(path: string): number;
  deleteFile(path: string): boolean;
  activeDownload(): number | null;
  startDownload(url: string, fileName: string, title: string): number;
  downloadStatus(id: number): NativeDownloadStatus;
  finishDownload(fileName: string): string;
  cancelDownload(): boolean;
}

// Null on web and in APKs built before this module existed; callers then fall
// back to the in-app download.
const native = requireOptionalNativeModule<ExpoJarvisBrainNativeModule>('ExpoJarvisBrain');

export function hasSystemDownloader(): boolean {
  return native !== null;
}

function sizeOf(path: string): number {
  if (native) return native.fileSize(path);
  try {
    const file = new File(path);
    return file.exists ? file.size ?? -1 : -1;
  } catch {
    return -1;
  }
}

/**
 * The brain already on this phone, if any: the configured file, then the
 * system-download location, then where older builds saved it.
 */
export function findInstalledModel(configured?: { path?: string; name?: string }): InstalledModel | null {
  const candidates: ModelCandidate[] = [];
  if (configured?.path) {
    candidates.push({
      path: configured.path,
      name: configured.name ?? modelFileName(configured.path),
      size: sizeOf(configured.path),
      minBytes: MIN_IMPORTED_MODEL_BYTES,
    });
  }
  const dir = native?.modelDirectory();
  if (dir) {
    const path = `file://${dir}/${RECOMMENDED_MODEL.name}`;
    candidates.push({ path, name: RECOMMENDED_MODEL.name, size: sizeOf(path), minBytes: MIN_COMPLETE_MODEL_BYTES });
  }
  const legacy = `${Paths.document.uri.replace(/\/$/, '')}/models/${RECOMMENDED_MODEL.name}`;
  candidates.push({ path: legacy, name: RECOMMENDED_MODEL.name, size: sizeOf(legacy), minBytes: MIN_COMPLETE_MODEL_BYTES });
  return pickInstalledModel(candidates);
}

/** True when Android is still holding a brain download for JARVIS, running or finished. */
export function hasPendingSystemDownload(): boolean {
  return native?.activeDownload() != null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Starts the system download, or attaches to the one already running, and
 * resolves with the finished file. Safe to call again after the app was
 * closed mid-download: it picks up the same download, not a new one.
 */
export async function downloadWithSystem(onView: (view: DownloadView) => void): Promise<InstalledModel> {
  if (!native) throw new Error('SYSTEM_DOWNLOADER_UNAVAILABLE');
  let id = native.activeDownload();
  if (id != null) {
    const previous = native.downloadStatus(id).state;
    if (previous === 'failed' || previous === 'missing') {
      native.cancelDownload();
      id = null;
    }
  }
  id ??= native.startDownload(RECOMMENDED_MODEL.url, RECOMMENDED_MODEL.name, 'JARVIS brain (Qwen3 4B)');
  for (;;) {
    const view = describeDownload(native.downloadStatus(id));
    onView(view);
    if (view.done) {
      if (view.failed) {
        native.cancelDownload();
        throw new Error(view.note ?? 'The brain download failed. Tap to try again.');
      }
      const path = native.finishDownload(RECOMMENDED_MODEL.name);
      const size = native.fileSize(path);
      if (size < MIN_COMPLETE_MODEL_BYTES) {
        native.deleteFile(path);
        throw new Error('MODEL_DOWNLOAD_SIZE_INVALID');
      }
      return { path, name: RECOMMENDED_MODEL.name, size };
    }
    await sleep(1000);
  }
}

export function deleteModelFile(path: string): void {
  if (native) {
    native.deleteFile(path);
    return;
  }
  const file = new File(path);
  if (file.exists) file.delete();
}
