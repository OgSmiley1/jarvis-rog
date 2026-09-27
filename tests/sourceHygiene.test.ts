import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A raw LINE SEPARATOR (U+2028) or PARAGRAPH SEPARATOR (U+2029) character in
 * source code ends a regex literal mid-line. While writing this project's
 * script-escaping helpers, the escape sequence for them was twice turned into
 * the character itself. tsc only catches that in files it type-checks, and
 * Metro/Hermes would fail on it at bundle time or at launch. This scan catches
 * it everywhere, cheaply.
 */
const ROOTS = ['app', 'components', 'context', 'hooks', 'lib', 'modules', 'plugins', 'scripts', 'tests'];
const EXTENSIONS = /\.(ts|tsx|js|mjs|kt|java|xml|json)$/;
// Built from code points, so this file cannot contain the characters it hunts.
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

function walk(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules' || entry === 'build' || entry.startsWith('.')) continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) walk(path, found);
    else if (EXTENSIONS.test(entry)) found.push(path);
  }
  return found;
}

describe('source hygiene', () => {
  it('contains no raw line or paragraph separator characters', () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(join(process.cwd(), root))) {
        const text = readFileSync(file, 'utf8');
        if (text.includes(LINE_SEPARATOR) || text.includes(PARAGRAPH_SEPARATOR)) offenders.push(relative(process.cwd(), file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
