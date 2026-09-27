import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('react-native-audio-api startup crash backport', () => {
  it('applies the audited upstream JS-thread initHybrid fix after install', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts?: Record<string, string> };
    const patcher = read('scripts/patch-react-native-audio-api.mjs');

    expect(pkg.scripts?.postinstall).toBe('node scripts/patch-react-native-audio-api.mjs');
    expect(patcher).toContain('context.assertOnJSQueueThread()');
    expect(patcher).toContain('mHybridData = initHybrid(workletsModule, jsContext, jsCallInvokerHolder)');
    expect(patcher).toContain('Expected vulnerable AudioAPIModule init/install block was not found');
  });
});
