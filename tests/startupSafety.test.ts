import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('startup safety contract', () => {
  it('does not statically load llama.rn through the root provider', () => {
    const provider = read('context/JarvisContext.tsx');

    expect(provider).not.toContain("import * as runtime from '@/lib/inference/standaloneModel'");
    expect(provider).toContain("import('@/lib/inference/standaloneModel')");
  });

  it('keeps the initial HUD route free of the heavy voice hook', () => {
    const route = read('app/(hud)/index.tsx');

    expect(route).not.toContain("from '@/hooks/useLiveVoice'");
    expect(route).toContain("import('@/components/JarvisHud')");
  });

  it('serves the workspaces from a stack, with no tab bar left to render', () => {
    const layout = read('app/(hud)/_layout.tsx');

    expect(layout).toContain('Stack');
    expect(layout).not.toContain('Tabs');
  });

  it('initializes ExecuTorch only when the voice runtime mounts', () => {
    const init = read('lib/voice/executorch.native.ts');
    const voice = read('hooks/useLiveVoice.native.ts');

    expect(init).toContain('export function ensureExecutorch');
    expect(voice).toContain('ensureExecutorch();');
  });
});
