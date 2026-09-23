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

  it('routes common app-open commands through the safe Termux launcher', () => {
    const route = routeDeterministicTool('Jarvis open YouTube');
    expect(route?.call.tool).toBe('termux.app_open');
    expect(route?.call.arguments).toEqual({ package: 'com.google.android.youtube' });
  });

  it('routes Arabic app-open commands', () => {
    const route = routeDeterministicTool('جارفس افتح whatsapp');
    expect(route?.call.tool).toBe('termux.app_open');
    expect(route?.call.arguments).toEqual({ package: 'com.whatsapp' });
  });

  it('routes the media and ROG apps the owner asks for by name', () => {
    expect(routeDeterministicTool('Jarvis launch Spotify')?.call.arguments).toEqual({ package: 'com.spotify.music' });
    expect(routeDeterministicTool('open armoury crate')?.call.arguments).toEqual({ package: 'com.asus.gamecenter' });
  });

  it('routes the camera directly', () => {
    expect(routeDeterministicTool('Jarvis open camera')?.call.tool).toBe('device.open_camera');
  });

  it('routes dialer without placing a call', () => {
    const route = routeDeterministicTool('Jarvis call +971501234567');
    expect(route?.call.tool).toBe('device.open_dialer');
    expect(route?.call.arguments).toEqual({ number: '+971501234567' });
  });

  it('routes SMS composer without sending', () => {
    expect(routeDeterministicTool('Jarvis open messages')?.call.tool).toBe('device.compose_sms');
  });

  it('routes Wi-Fi settings', () => {
    expect(routeDeterministicTool('Jarvis open wifi settings')?.call.tool).toBe('device.open_wifi_settings');
  });

  it('leaves ordinary requests for reasoning', () => {
    expect(routeDeterministicTool('help me plan my week')).toBeNull();
  });
});
