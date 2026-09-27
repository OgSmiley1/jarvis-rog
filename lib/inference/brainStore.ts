import { requireOptionalNativeModule } from 'expo';
import { File, Paths } from 'expo-file-system';
import {
  brainCandidates,
  describeDownload,
  pickInstalledModel,
  type KnownBrain,
  type DownloadView,
  type InstalledModel,
  type NativeDownloadStatus,
} from '@/lib/inference/brainPresence';
import { PREVIOUS_MODEL, RECOMMENDED_MODEL } from '@/lib/inference/modelImport';

interface ExpoJarvisBrainNativeModule {
  modelDirectory(): string | null;
  permanentDirectory?(): string;
  legacyDirectory?(): string | null;
  storageAccess?(): boolean;
  openStorageAccessSettings?(): boolean;
  moveToPermanent?(): Promise<number>;
  adoptFile?(source: string, fileName: string): Promise<boolean>;
  readJarvisFile?(name: string): string | null;
  writeJarvisFile?(name: string, text: string): Promise<boolean>;
  fileSize(path: string): number;
  deleteFile(path: string): boolean;
  activeDownload(fileName: string): number | null;
  startDownload(url: string, fileName: string, title: string): number;
  downloadStatus(id: number): NativeDownloadStatus;
  finishDownload(fileName: string): string;
  cancelDownload(fileName: string): boolean;
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

/** Best first: the 8B, then the 4B earlier builds downloaded. */
export const KNOWN_BRAINS: KnownBrain[] = [
  { name: RECOMMENDED_MODEL.name, minBytes: RECOMMENDED_MODEL.minBytes },
  { name: PREVIOUS_MODEL.name, minBytes: PREVIOUS_MODEL.minBytes },
];

/** Every folder a model may be in: the permanent one first, then the app's own, then where the oldest builds kept it. */
export function modelFolders(): string[] {
  const folders = [
    native?.permanentDirectory?.(),
    native?.modelDirectory(),
    native?.legacyDirectory?.(),
    `${Paths.document.uri.replace(/\/$/, '')}/models`,
  ].filter((folder): folder is string => Boolean(folder));
  return [...new Set(folders.map((folder) => folder.replace(/^file:\/\//, '')))];
}

/** The brain already on this phone, if any — the best one found in any folder. */
export function findInstalledModel(configured?: { path?: string; name?: string }): InstalledModel | null {
  return pickInstalledModel(brainCandidates(modelFolders(), KNOWN_BRAINS, sizeOf, configured));
}

/** True when JARVIS may use the permanent Download/JARVIS folder ("All files access"). */
export function hasPermanentStorage(): boolean {
  return native?.storageAccess?.() ?? false;
}

/** Opens Android's "All files access" page for JARVIS. */
export function askForPermanentStorage(): boolean {
  return native?.openStorageAccessSettings?.() ?? false;
}

/** Moves models left in the app's own folder into the permanent one. Returns how many moved. */
export async function moveModelsToPermanent(): Promise<number> {
  if (!native?.moveToPermanent || !hasPermanentStorage()) return 0;
  return native.moveToPermanent();
}

/** Copies a file an older build downloaded elsewhere into the model folder, once. */
export async function adoptModelFile(source: string, fileName: string): Promise<boolean> {
  if (!native?.adoptFile) return false;
  try {
    return await native.adoptFile(source, fileName);
  } catch {
    return false;
  }
}

/** A model file JARVIS downloads: where from, what it is called, how big a complete one is. */
export interface ModelFile {
  url: string;
  name: string;
  title: string;
  minBytes: number;
}

export const BRAIN_FILE: ModelFile = {
  url: RECOMMENDED_MODEL.url,
  name: RECOMMENDED_MODEL.name,
  title: 'JARVIS brain (Qwen3 8B)',
  minBytes: RECOMMENDED_MODEL.minBytes,
};

/** True when Android is still holding a download for this file, running or finished. */
export function hasPendingSystemDownload(file: ModelFile = BRAIN_FILE): boolean {
  return native?.activeDownload(file.name) != null;
}

/** The complete file in any model folder (the permanent one first), or null. */
export function findModelFile(file: ModelFile): InstalledModel | null {
  if (!native) return null;
  for (const dir of modelFolders()) {
    const path = `file://${dir}/${file.name}`;
    const size = sizeOf(path);
    if (size >= file.minBytes) return { path, name: file.name, size };
  }
  return null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Starts the system download, or attaches to the one already running, and
 * resolves with the finished file. Safe to call again after the app was
 * closed mid-download: it picks up the same download, not a new one.
 */
export async function downloadWithSystem(
  onView: (view: DownloadView) => void,
  file: ModelFile = BRAIN_FILE,
): Promise<InstalledModel> {
  if (!native) throw new Error('SYSTEM_DOWNLOADER_UNAVAILABLE');
  let id = native.activeDownload(file.name);
  if (id != null) {
    const previous = native.downloadStatus(id).state;
    if (previous === 'failed' || previous === 'missing') {
      native.cancelDownload(file.name);
      id = null;
    }
  }
  id ??= native.startDownload(file.url, file.name, file.title);
  for (;;) {
    const view = describeDownload(native.downloadStatus(id));
    onView(view);
    if (view.done) {
      if (view.failed) {
        native.cancelDownload(file.name);
        throw new Error(view.note ?? 'The download failed. Tap to try again.');
      }
      const path = native.finishDownload(file.name);
      const size = native.fileSize(path);
      if (size < file.minBytes) {
        native.deleteFile(path);
        throw new Error('MODEL_DOWNLOAD_SIZE_INVALID');
      }
      return { path, name: file.name, size };
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

/** A small text file in Download/JARVIS itself, or null (no file, or no permanent storage). */
export function readJarvisFile(name: string): string | null {
  try {
    return native?.readJarvisFile?.(name) ?? null;
  } catch {
    return null;
  }
}

/** Writes a small text file into Download/JARVIS. False without permanent storage. */
export async function writeJarvisFile(name: string, text: string): Promise<boolean> {
  if (!native?.writeJarvisFile) return false;
  return native.writeJarvisFile(name, text);
}
