import { describe, expect, it } from 'vitest';
import { frameRms, levelFromFrame, rmsToLevel, smoothLevel } from '@/lib/voice/audioLevel';

function sine(amplitude: number, samples = 1600): Float32Array {
  const frame = new Float32Array(samples);
  for (let index = 0; index < samples; index += 1) {
    frame[index] = amplitude * Math.sin((2 * Math.PI * 440 * index) / 16000);
  }
  return frame;
}

describe('measured microphone level', () => {
  it('returns zero for an empty frame rather than guessing', () => {
    expect(frameRms(new Float32Array(0))).toBe(0);
    expect(levelFromFrame(new Float32Array(0))).toBe(0);
  });

  it('computes RMS of a sine at amplitude/sqrt(2)', () => {
    expect(frameRms(sine(1))).toBeCloseTo(1 / Math.SQRT2, 3);
    expect(frameRms(sine(0.5))).toBeCloseTo(0.5 / Math.SQRT2, 3);
  });

  it('ignores non-finite samples instead of producing NaN', () => {
    expect(frameRms([0.5, Number.NaN, 0.5, Number.POSITIVE_INFINITY])).toBeGreaterThan(0);
    expect(Number.isFinite(frameRms([Number.NaN]))).toBe(true);
  });

  it('maps the speech window onto 0..1 and clamps outside it', () => {
    expect(rmsToLevel(0)).toBe(0);
    expect(rmsToLevel(10 ** (-70 / 20))).toBe(0);
    expect(rmsToLevel(10 ** (-5 / 20))).toBe(1);
    expect(rmsToLevel(10 ** (-35 / 20))).toBeCloseTo(0.5, 2);
  });

  it('rises faster than it falls, so the ring answers speech without flickering', () => {
    const rising = smoothLevel(0, 1);
    const falling = smoothLevel(1, 0);
    expect(rising).toBeGreaterThan(0.5);
    expect(falling).toBeGreaterThan(0.8);
  });

  it('stays inside 0..1 for hostile input', () => {
    expect(smoothLevel(Number.NaN, 5)).toBeLessThanOrEqual(1);
    expect(smoothLevel(-3, -3)).toBeGreaterThanOrEqual(0);
  });

  it('reads a loud frame higher than a quiet one', () => {
    const quiet = levelFromFrame(sine(0.01));
    const loud = levelFromFrame(sine(0.3));
    expect(loud).toBeGreaterThan(quiet);
  });
});
