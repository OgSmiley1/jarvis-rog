import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('rejects misleading binary manifest evidence for the actual microphone service', () => {
  const result = execFileSync('python3', ['-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_release_manifest.py'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  expect(result).toBe('');
});
