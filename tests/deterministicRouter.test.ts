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

  it('routes a Jarvis-prefixed email request', () => {
    expect(routeDeterministicTool('Jarvis, open email')?.call.tool).toBe('device.compose_email');
  });

  it('routes map searches in English', () => {
    const route = routeDeterministicTool('Jarvis show me the map of Dubai Mall');
    expect(route?.call.tool).toBe('device.open_map_search');
    expect(route?.call.arguments).toEqual({ query: 'Dubai Mall' });
  });

  it('routes map searches in Arabic', () => {
    const route = routeDeterministicTool('جارفس شوف لي الخريطة دبي مول');
    expect(route?.call.tool).toBe('device.open_map_search');
    expect(route?.call.arguments).toEqual({ query: 'دبي مول' });
  });

  it('leaves ordinary requests for reasoning', () => {
    expect(routeDeterministicTool('help me plan my week')).toBeNull();
  });
});
