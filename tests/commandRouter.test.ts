import { describe, expect, it } from 'vitest';
import { routeCommand } from '@/lib/understand/commandRouter';

describe('slash command routing', () => {
  it('routes analyse with text', () => {
    expect(routeCommand('/analyse hello')).toEqual({ type: 'understand', mode: 'analyse', text: 'hello' });
  });

  it('routes workspace shortcuts', () => {
    expect(routeCommand('/project')).toEqual({ type: 'project' });
    expect(routeCommand('/memory')).toEqual({ type: 'memory' });
    expect(routeCommand('/status')).toEqual({ type: 'status' });
  });

  it('does not treat an empty analyse command as a valid routed request', () => {
    expect(routeCommand('/analyse')).toEqual({ type: 'chat', text: '/analyse' });
  });

  it('preserves unknown slash input as chat', () => {
    expect(routeCommand('/unknown hello')).toEqual({ type: 'chat', text: '/unknown hello' });
  });
});
