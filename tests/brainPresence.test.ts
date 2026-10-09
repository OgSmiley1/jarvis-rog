import { describe, expect, it } from 'vitest';
import {
  describeDownload,
  MIN_COMPLETE_MODEL_BYTES,
  MIN_IMPORTED_MODEL_BYTES,
  pickInstalledModel,
} from '@/lib/inference/brainPresence';

const full = 2_497_280_256;

describe('pickInstalledModel', () => {
  it('reuses the configured file when it is on disk', () => {
    expect(
      pickInstalledModel([{ path: '/a/q.gguf', name: 'q.gguf', size: full, minBytes: MIN_IMPORTED_MODEL_BYTES }]),
    ).toEqual({ path: '/a/q.gguf', name: 'q.gguf', size: full });
  });

  it('falls through to the next location when the configured file is gone', () => {
    const picked = pickInstalledModel([
      { path: '/old/q.gguf', name: 'q.gguf', size: -1, minBytes: MIN_IMPORTED_MODEL_BYTES },
      { path: '/new/q.gguf', name: 'q.gguf', size: full, minBytes: MIN_COMPLETE_MODEL_BYTES },
    ]);
    expect(picked?.path).toBe('/new/q.gguf');
  });

  it('never treats a truncated recommended download as installed', () => {
    expect(
      pickInstalledModel([{ path: '/m/q.gguf', name: 'q.gguf', size: 900_000_000, minBytes: MIN_COMPLETE_MODEL_BYTES }]),
    ).toBeNull();
  });

  it('accepts a small model the owner imported', () => {
    expect(
      pickInstalledModel([{ path: '/m/tiny.gguf', name: 'tiny.gguf', size: 700_000_000, minBytes: MIN_IMPORTED_MODEL_BYTES }]),
    ).not.toBeNull();
  });

  it('returns null when nothing is on disk', () => {
    expect(pickInstalledModel([])).toBeNull();
  });
});

describe('describeDownload', () => {
  it('reports progress while running', () => {
    expect(describeDownload({ state: 'running', bytes: 500, total: 1000 })).toEqual({ progress: 0.5, done: false, failed: false });
  });

  it('keeps progress unknown until Android knows the size', () => {
    expect(describeDownload({ state: 'pending', bytes: 0, total: -1 }).progress).toBeNull();
  });

  it('explains a pause instead of looking stuck', () => {
    expect(describeDownload({ state: 'paused', bytes: 10, total: 100, reason: 2 }).note).toBe('Waiting for internet…');
  });

  it('names the storage problem on failure', () => {
    const view = describeDownload({ state: 'failed', reason: 1006 });
    expect(view.failed).toBe(true);
    expect(view.note).toContain('storage');
  });

  it('treats a download that vanished as failed, so a new one can start', () => {
    expect(describeDownload({ state: 'missing' })).toMatchObject({ done: true, failed: true });
  });
});
