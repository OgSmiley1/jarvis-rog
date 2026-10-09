import { describe, expect, it } from 'vitest';
import { detectPageSwitch, pageSwitchedReply } from '@/lib/hud/hudCommands';
import { liveCapture, setLiveCapture } from '@/lib/vision/liveCapture';

describe('camera page commands', () => {
  it.each([
    ['open the camera', 'camera'],
    ['Jarvis, show camera', 'camera'],
    ['camera view', 'camera'],
    ['turn on your eyes', 'camera'],
    ['افتح الكاميرا', 'camera'],
    ['close the camera', 'orb'],
    ['back to home', 'orb'],
    ['أغلق الكاميرا', 'orb'],
  ])('%s → %s', (said, page) => {
    expect(detectPageSwitch(said)).toBe(page);
  });

  it.each(['open camera app settings', 'what do you see', 'open youtube', 'take a photo of the camera'])(
    'leaves %s to the other routes',
    (said) => {
      expect(detectPageSwitch(said)).toBeNull();
    },
  );

  it('replies in the current language', () => {
    expect(pageSwitchedReply('camera', 'en')).toMatch(/what I see/);
    expect(pageSwitchedReply('orb', 'ar')).toBe('أغلقت الكاميرا.');
  });
});

describe('live capture', () => {
  it('is only available while the camera page has registered it', async () => {
    expect(liveCapture()).toBeNull();
    const release = setLiveCapture(async () => 'file:///frame.jpg');
    await expect(liveCapture()?.()).resolves.toBe('file:///frame.jpg');
    release();
    expect(liveCapture()).toBeNull();
  });

  it('a stale release does not clear a newer registration', () => {
    const first = setLiveCapture(async () => 'a');
    const second = setLiveCapture(async () => 'b');
    first();
    expect(liveCapture()).not.toBeNull();
    second();
    expect(liveCapture()).toBeNull();
  });
});
