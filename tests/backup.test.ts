import { describe, expect, it } from 'vitest';
import { buildBackup, parseBackup, shouldRestore } from '@/lib/storage/backup';
import type { JarvisProject, JarvisSettings, MemoryRecord } from '@/lib/storage/types';

// The database needs the phone; the backup only needs a settings object.
const DEFAULT_SETTINGS = { language: 'en', wakeWord: 'jarvis' } as unknown as JarvisSettings;

const memory: MemoryRecord = {
  id: 'm1', title: 'Mom', body: 'Call Mom on Fridays', type: 'preference' as MemoryRecord['type'], source: 'user' as MemoryRecord['source'],
  approved: true, pinned: false, tags: [], createdAt: 1, updatedAt: 1,
};
const project: JarvisProject = { id: 'p1', name: 'JARVIS', objective: 'Ship it', status: 'active', createdAt: 1, updatedAt: 1 };

describe('memories survive a reinstall', () => {
  it('round-trips through the file', () => {
    const backup = buildBackup({ settings: { ...DEFAULT_SETTINGS, language: 'ar' }, memories: [memory], projects: [project], steps: [], now: 5 });
    const read = parseBackup(JSON.stringify(backup));
    expect(read?.memories[0]?.body).toBe('Call Mom on Fridays');
    expect(read?.settings.language).toBe('ar');
  });

  it('never carries a live-transcript opt-in over', () => {
    const backup = buildBackup({ settings: { ...DEFAULT_SETTINGS, liveTranscriptsUntil: 99 }, memories: [], projects: [], steps: [], now: 5 });
    expect('liveTranscriptsUntil' in backup.settings).toBe(false);
  });

  it('ignores a damaged or foreign file', () => {
    expect(parseBackup('{not json')).toBeNull();
    expect(parseBackup(JSON.stringify({ version: 99 }))).toBeNull();
    expect(parseBackup(null)).toBeNull();
  });

  it('restores onto a fresh install only', () => {
    const backup = buildBackup({ settings: DEFAULT_SETTINGS, memories: [memory], projects: [], steps: [], now: 5 });
    expect(shouldRestore({ settingsSaved: false, memories: 0, projects: 0 }, backup)).toBe(true);
    // Anything already on this install wins over an older file.
    expect(shouldRestore({ settingsSaved: true, memories: 0, projects: 0 }, backup)).toBe(false);
    expect(shouldRestore({ settingsSaved: false, memories: 3, projects: 0 }, backup)).toBe(false);
    expect(shouldRestore({ settingsSaved: false, memories: 0, projects: 0 }, null)).toBe(false);
  });
});
