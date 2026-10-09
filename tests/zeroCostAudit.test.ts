import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROVIDERS } from '@/lib/net/providerPolicy';
import { askCloud } from '@/lib/online/cloudBrain';

/**
 * The AED 0 audit, as a test. It fails the build if a network call appears
 * anywhere the provider policy cannot see it, or if a live-data source is
 * added without a manifest entry.
 */

const ROOTS = ['app', 'components', 'context', 'hooks', 'lib'];

function walk(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) walk(path, found);
    else if (/\.(ts|tsx)$/.test(entry)) found.push(path);
  }
  return found;
}

const sources = ROOTS.flatMap((root) => walk(join(process.cwd(), root))).map((file) => ({
  file: relative(process.cwd(), file),
  // Comments are not calls.
  text: readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''),
}));

/** Each known network call site, and why it is covered. */
const CALL_SITES: Record<string, string> = {
  'lib/net/http.ts': 'live-data tools: checkProvider before every request',
  'lib/online/cloudBrain.ts': 'cloud brain: checkProvider per provider per call',
  'lib/telemetry/githubChannel.ts': "owner's own live test link (manifest: github), off unless turned on",
  'lib/tools/termuxClient.ts': 'loopback 127.0.0.1 only (manifest: termux, local)',
};

describe('zero-cost audit', () => {
  it('every network call lives in a file the policy covers', () => {
    const offenders = sources
      .filter(({ text }) => /\bfetch\s*\(|fetchImpl\s*\(|XMLHttpRequest|new\s+WebSocket/.test(text))
      .map(({ file }) => file)
      .filter((file) => !(file in CALL_SITES));
    expect(offenders).toEqual([]);
  });

  it('every API host the live tools call is in the manifest', () => {
    const hosts = new Set(Object.values(PROVIDERS).map((p) => p.host));
    const used = new Set<string>();
    for (const { file, text } of sources) {
      // Request URLs only: freeApis builds them inline; the cloud brain names each `endpoint`.
      const pattern = file === 'lib/tools/freeApis.ts' ? /https:\/\/([a-z0-9.-]+)\//g : file === 'lib/online/cloudBrain.ts' ? /endpoint:\s*'https:\/\/([a-z0-9.-]+)\//g : null;
      if (!pattern) continue;
      for (const match of text.matchAll(pattern)) used.add(match[1]!);
    }
    const missing = [...used].filter((host) => !hosts.has(host));
    expect(missing).toEqual([]);
    expect(used.size).toBeGreaterThanOrEqual(10);
  });

  it('the termux bridge never leaves the phone', () => {
    const termux = sources.find((s) => s.file === 'lib/tools/termuxClient.ts')!;
    expect(termux.text).toMatch(/http:\/\/127\.0\.0\.1:/);
    expect(termux.text).not.toMatch(/https?:\/\/(?!127\.0\.0\.1)/);
  });

  it('no paid or unknown provider is ever called by the cloud brain', async () => {
    const called: string[] = [];
    await askCloud({
      messages: [{ role: 'user', content: 'hi' }],
      mode: 'fast',
      keys: { gemini: 'k' },
      fetchImpl: async (url: string) => {
        called.push(url);
        return new Response('{}', { status: 500 });
      },
    } as unknown as Parameters<typeof askCloud>[0]).catch(() => undefined);
    // Gemini may train on prompts: without its own switch it is not called at all.
    expect(called).toEqual([]);
  });
});
