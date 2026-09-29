import { describe, expect, it } from 'vitest';
import { formatClock, shortModelName, statusLine } from '@/lib/hud/dashboard';

describe('dashboard clock', () => {
  const at = new Date(2026, 8, 25, 3, 43);
  it('24-hour time and a spelled-out date', () => {
    expect(formatClock(at, 'en')).toEqual({ time: '03:43', date: 'FRIDAY 25 SEPTEMBER' });
  });
  it('Arabic date', () => {
    expect(formatClock(at, 'ar').date).toBe('الجمعة 25 سبتمبر');
  });
  it('midnight and afternoon', () => {
    expect(formatClock(new Date(2026, 3, 28, 0, 5), 'en').time).toBe('00:05');
    expect(formatClock(new Date(2026, 3, 28, 17, 30), 'en').time).toBe('17:30');
  });
});

describe('status line', () => {
  it('shortens the model file name', () => {
    expect(shortModelName('Qwen3-4B-Q4_K_M.gguf')).toBe('Qwen3 4B');
    expect(shortModelName('custom.gguf')).toBe('custom');
  });
  it('model · mic · battery', () => {
    expect(
      statusLine({ modelStatus: 'ready', modelName: 'Qwen3-4B-Q4_K_M.gguf', cloudReady: false, micOn: true, battery: 0.34 }, 'en'),
    ).toBe('Qwen3 4B · mic on · 34%');
  });
  it('says the camera is on whenever it is', () => {
    expect(statusLine({ modelStatus: 'ready', cloudReady: false, micOn: false, camera: true }, 'en')).toBe(
      'brain ready · mic off · camera on',
    );
  });
  it('never shows an unknown battery as a number', () => {
    expect(statusLine({ modelStatus: 'unloaded', cloudReady: false, micOn: false, battery: -1 }, 'en')).toBe('no brain · mic off');
  });
  it('charging and cloud', () => {
    expect(statusLine({ modelStatus: 'unloaded', cloudReady: true, micOn: true, battery: 0.8, charging: true }, 'en')).toBe(
      'cloud brain · mic on · 80% ⚡',
    );
  });
});
