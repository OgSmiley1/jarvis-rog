/**
 * Decides whether the brain is already on the phone, and reads Android's
 * download status for it. No native or Expo imports, so it is unit-tested.
 *
 * The rule the whole app follows: a model file that is already on disk is
 * loaded, never re-downloaded, and never deleted because a load failed.
 */

/** Anything smaller than this at the recommended path is a truncated or failed download. */
export const MIN_COMPLETE_MODEL_BYTES = 2_000_000_000;
/** An owner-imported model can be small, but not this small. */
export const MIN_IMPORTED_MODEL_BYTES = 50_000_000;

export interface ModelCandidate {
  path: string;
  name: string;
  /** Bytes on disk, or -1 when the file does not exist. */
  size: number;
  minBytes: number;
}

export interface InstalledModel {
  path: string;
  name: string;
  size: number;
}

/** A brain JARVIS knows by name, and the smallest size a complete copy has. */
export interface KnownBrain {
  name: string;
  minBytes: number;
}

/**
 * Every place a brain may be, best first. A model the owner imported by hand
 * (a name JARVIS does not know) comes first: it was chosen on purpose. Then
 * each known brain, the best first (the 8B before the 4B), in each folder,
 * the permanent one first; so a configured 4B gives way to an 8B that has
 * since arrived. The configured file, when it is a known brain somewhere
 * else, comes last. Paths are de-duplicated.
 */
export function brainCandidates(
  folders: Array<string | null | undefined>,
  brains: KnownBrain[],
  sizeOf: (path: string) => number,
  configured?: { path?: string; name?: string },
): ModelCandidate[] {
  const candidates: ModelCandidate[] = [];
  const seen = new Set<string>();
  const add = (path: string, name: string, minBytes: number) => {
    const key = path.replace(/^file:\/\//, '');
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ path, name, size: sizeOf(path), minBytes });
  };
  const configuredName = configured?.path ? configured.name ?? modelFileName(configured.path) : undefined;
  const known = brains.find((brain) => brain.name === configuredName);
  if (configured?.path && configuredName && !known) add(configured.path, configuredName, MIN_IMPORTED_MODEL_BYTES);
  for (const brain of brains) {
    for (const folder of folders) {
      if (!folder) continue;
      const base = folder.startsWith('file://') ? folder : `file://${folder}`;
      add(`${base.replace(/\/$/, '')}/${brain.name}`, brain.name, brain.minBytes);
    }
  }
  if (configured?.path && configuredName && known) add(configured.path, configuredName, known.minBytes);
  return candidates;
}

export function pickInstalledModel(candidates: ModelCandidate[]): InstalledModel | null {
  const found = candidates.find((candidate) => candidate.size >= candidate.minBytes && candidate.size > 0);
  return found ? { path: found.path, name: found.name, size: found.size } : null;
}

export function modelFileName(path: string): string {
  return path.split('/').pop() ?? path;
}

export type DownloadState = 'pending' | 'running' | 'paused' | 'success' | 'failed' | 'missing';

export interface NativeDownloadStatus {
  state: DownloadState;
  bytes?: number;
  total?: number;
  reason?: number;
}

export interface DownloadView {
  /** 0..1, or null while the size is not known yet. */
  progress: number | null;
  done: boolean;
  failed: boolean;
  /** Plain words for the owner when the download is waiting or failed. */
  note?: string;
}

// android.app.DownloadManager PAUSED_* and ERROR_* reason codes.
const PAUSED_NOTES: Record<number, string> = {
  1: 'Waiting to retry…',
  2: 'Waiting for internet…',
  3: 'Waiting for Wi-Fi…',
};

const FAILED_NOTES: Record<number, string> = {
  1001: 'The phone could not write the file.',
  1004: 'The download server answered with an error.',
  1005: 'Too many redirects from the download server.',
  1006: 'Not enough free storage. Free about 3 GB and try again.',
  1007: 'No storage available for the download.',
  1008: 'The download could not resume. Tap to start it again.',
  1009: 'The file already exists and could not be replaced.',
};

export function describeDownload(status: NativeDownloadStatus): DownloadView {
  const total = status.total ?? -1;
  const bytes = status.bytes ?? 0;
  const progress = total > 0 ? Math.max(0, Math.min(1, bytes / total)) : null;
  switch (status.state) {
    case 'success':
      return { progress: 1, done: true, failed: false };
    case 'failed':
      return {
        progress,
        done: true,
        failed: true,
        note: FAILED_NOTES[status.reason ?? -1] ?? `The download failed (reason ${status.reason ?? 'unknown'}).`,
      };
    case 'missing':
      return { progress: null, done: true, failed: true, note: 'The download was cancelled.' };
    case 'paused':
      return { progress, done: false, failed: false, note: PAUSED_NOTES[status.reason ?? -1] ?? 'Paused by Android…' };
    default:
      return { progress, done: false, failed: false };
  }
}

/**
 * After "All files access" is granted on a fresh install, the brain that was
 * in Download/JARVIS all along becomes visible. Load it then — unless a brain
 * is already running or loading.
 */
export function shouldLoadAfterAccess(modelStatus: string, brainFound: boolean): boolean {
  return brainFound && modelStatus !== 'ready' && modelStatus !== 'loading';
}
