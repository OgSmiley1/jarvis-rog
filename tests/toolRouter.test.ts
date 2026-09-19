import { describe, expect, it } from 'vitest';
import { executeTool } from '@/lib/tools/router';

it('rejects unknown tools', async () => {
  const result = await executeTool({ id: '1', tool: 'danger.execute_anything', arguments: {} });
  expect(result.ok).toBe(false);
  expect(result.error).toBe('UNKNOWN_TOOL');
});
