import { expect, it } from 'vitest';
import { runSelfTest } from '@/lib/diagnostics/selfTest';
import { toolRegistry } from '@/lib/tools/registry';
import { observeToolResult } from '@/lib/diagnostics/toolEvidence';

it('reports every registered feature and distinguishes registry from execution', async () => {
  observeToolResult({ callId: 'test', tool: 'utility.time', ok: false, error: 'test failure', startedAt: 100, finishedAt: 120 });
  const checks = await runSelfTest({ modelPresent: false, modelReady: false });
  expect(checks.filter(check => check.name.startsWith('Feature: '))).toHaveLength(toolRegistry.size);
  expect(checks.find(check => check.name === 'Feature: utility.time')).toMatchObject({ status: 'FAIL', detail: expect.stringContaining('test failure') });
  expect(checks.find(check => check.name === 'Feature: utility.calculate')).toMatchObject({ status: 'PASS', detail: expect.stringContaining('Handler returned') });
  expect(checks.find(check => check.name === 'Feature: phone.call')?.status).toBe('UNVERIFIED');
});
