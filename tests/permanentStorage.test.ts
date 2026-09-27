import { describe, expect, it } from 'vitest';
import { brainCandidates, pickInstalledModel, type KnownBrain } from '@/lib/inference/brainPresence';

const BRAINS: KnownBrain[] = [
  { name: 'Qwen3-8B-Q4_K_M.gguf', minBytes: 4_500_000_000 },
  { name: 'Qwen3-4B-Q4_K_M.gguf', minBytes: 2_000_000_000 },
];
const PERMANENT = '/storage/emulated/0/Download/JARVIS/models';
const APP = '/storage/emulated/0/Android/data/com.app.localjarviscoach/files/models';

const disk = (files: Record<string, number>) => (path: string) => files[path.replace(/^file:\/\//, '')] ?? -1;

describe('the brain is found wherever it was saved', () => {
  it('prefers the permanent folder', () => {
    const sizes = disk({ [`${PERMANENT}/Qwen3-4B-Q4_K_M.gguf`]: 2_497_280_256, [`${APP}/Qwen3-4B-Q4_K_M.gguf`]: 2_497_280_256 });
    expect(pickInstalledModel(brainCandidates([PERMANENT, APP], BRAINS, sizes))?.path).toBe(`file://${PERMANENT}/Qwen3-4B-Q4_K_M.gguf`);
  });

  it('still finds a brain an older build left in the app folder', () => {
    const sizes = disk({ [`${APP}/Qwen3-4B-Q4_K_M.gguf`]: 2_497_280_256 });
    expect(pickInstalledModel(brainCandidates([PERMANENT, APP], BRAINS, sizes))?.name).toBe('Qwen3-4B-Q4_K_M.gguf');
  });

  it('switches to the 8B once it is on the phone, even while the 4B is the configured one', () => {
    const sizes = disk({ [`${PERMANENT}/Qwen3-8B-Q4_K_M.gguf`]: 5_027_783_488, [`${APP}/Qwen3-4B-Q4_K_M.gguf`]: 2_497_280_256 });
    const configured = { path: `file://${APP}/Qwen3-4B-Q4_K_M.gguf`, name: 'Qwen3-4B-Q4_K_M.gguf' };
    expect(pickInstalledModel(brainCandidates([PERMANENT, APP], BRAINS, sizes, configured))?.name).toBe('Qwen3-8B-Q4_K_M.gguf');
  });

  it('keeps a model the owner imported by hand', () => {
    const custom = '/data/user/0/app/files/models/My-Model.gguf';
    const sizes = disk({ [custom]: 900_000_000, [`${PERMANENT}/Qwen3-8B-Q4_K_M.gguf`]: 5_027_783_488 });
    expect(pickInstalledModel(brainCandidates([PERMANENT], BRAINS, sizes, { path: custom, name: 'My-Model.gguf' }))?.path).toBe(custom);
  });

  it('never takes a half-downloaded 8B', () => {
    const sizes = disk({ [`${PERMANENT}/Qwen3-8B-Q4_K_M.gguf`]: 3_000_000_000, [`${PERMANENT}/Qwen3-4B-Q4_K_M.gguf`]: 2_497_280_256 });
    expect(pickInstalledModel(brainCandidates([PERMANENT], BRAINS, sizes))?.name).toBe('Qwen3-4B-Q4_K_M.gguf');
  });

  it('lists each path once, even when two folders are the same', () => {
    const list = brainCandidates([PERMANENT, `file://${PERMANENT}`, PERMANENT], BRAINS, () => -1);
    expect(list).toHaveLength(2);
  });

  it('nothing on the phone means nothing found — the app never guesses', () => {
    expect(pickInstalledModel(brainCandidates([PERMANENT, APP], BRAINS, () => -1))).toBeNull();
  });
});
