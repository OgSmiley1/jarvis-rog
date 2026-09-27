import type { JarvisProject, JarvisSettings, MemoryRecord, ProjectStep } from './types';

/**
 * What JARVIS knows about the owner — memories, projects and settings —
 * copied to Download/JARVIS/backup.json, next to the models. The app's own
 * database is wiped when the app is uninstalled; this file is not, so a
 * reinstall picks up where the owner left off. No keys or tokens are in it:
 * those stay in the Android keystore. No native or Expo imports: unit-tested.
 */

export const BACKUP_FILE = 'backup.json';
const VERSION = 1;

export interface JarvisBackup {
  version: number;
  savedAt: number;
  settings: Partial<JarvisSettings>;
  memories: MemoryRecord[];
  projects: JarvisProject[];
  steps: ProjectStep[];
}

export function buildBackup(input: {
  settings: JarvisSettings;
  memories: MemoryRecord[];
  projects: JarvisProject[];
  steps: ProjectStep[];
  now: number;
}): JarvisBackup {
  // A transcript opt-in is for one test session; it never outlives the install.
  const { liveTranscriptsUntil: _expiring, ...settings } = input.settings;
  return { version: VERSION, savedAt: input.now, settings, memories: input.memories, projects: input.projects, steps: input.steps };
}

/** The backup in a file, or null when the text is not one this build can read. */
export function parseBackup(text: string | null): JarvisBackup | null {
  if (!text) return null;
  try {
    const value = JSON.parse(text) as Partial<JarvisBackup>;
    if (value.version !== VERSION || typeof value.savedAt !== 'number') return null;
    if (!Array.isArray(value.memories) || !Array.isArray(value.projects) || !Array.isArray(value.steps)) return null;
    if (!value.settings || typeof value.settings !== 'object') return null;
    return value as JarvisBackup;
  } catch {
    return null;
  }
}

/**
 * Restore only onto a fresh install: no settings ever saved, no memories, no
 * projects. Anything the owner already has on this install always wins over
 * the file, so an older backup can never undo a change made since.
 */
export function shouldRestore(
  current: { settingsSaved: boolean; memories: number; projects: number },
  backup: JarvisBackup | null,
): backup is JarvisBackup {
  if (!backup) return false;
  if (current.settingsSaved || current.memories > 0 || current.projects > 0) return false;
  return backup.memories.length > 0 || backup.projects.length > 0 || Object.keys(backup.settings).length > 0;
}
