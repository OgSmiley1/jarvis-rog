import { describe, expect, it } from 'vitest';
import { routeDeterministicTool } from '@/lib/tools/deterministicRouter';

describe('deterministic tool routing', () => {
  it('routes application settings without an LLM', () => {
    expect(routeDeterministicTool('open settings')?.call.tool).toBe('device.open_settings');
  });

  it('routes only explicit http(s) URLs', () => {
    const route = routeDeterministicTool('open https://example.com');
    expect(route?.call.tool).toBe('device.open_url');
    expect(route?.call.arguments).toEqual({ url: 'https://example.com' });
  });

  it('leaves ordinary requests for reasoning', () => {
    expect(routeDeterministicTool('help me plan my week')).toBeNull();
  });
});
