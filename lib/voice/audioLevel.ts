/**
 * Real microphone level, measured from the PCM frames the recorder actually
 * delivered. Nothing here invents a value: with no samples the level is 0 and
 * the caller must present it as "not measured" rather than as silence.
 */

/** Root-mean-square of a mono float PCM frame, in the samples' own units. */
export function frameRms(samples: ArrayLike<number>): number {
  const length = samples.length;
  if (length === 0) return 0;

  let sum = 0;
  for (let index = 0; index < length; index += 1) {
    const sample = samples[index];
    if (sample === undefined || !Number.isFinite(sample)) continue;
    sum += sample * sample;
  }

  const mean = sum / length;
  return mean > 0 ? Math.sqrt(mean) : 0;
}

/**
 * Map an RMS reading onto 0..1 for the HUD ring.
 *
 * Speech at a normal distance from a phone microphone sits far below full
 * scale, so a linear RMS barely moves the ring. This applies a decibel curve
 * across a speech-shaped window: -60 dBFS reads as silence, -10 dBFS as full.
 * It is a display mapping of a measured value, not a gain stage.
 */
export function rmsToLevel(rms: number, floorDb = -60, ceilingDb = -10): number {
  if (!Number.isFinite(rms) || rms <= 0) return 0;
  if (ceilingDb <= floorDb) return 0;

  const db = 20 * Math.log10(rms);
  if (db <= floorDb) return 0;
  if (db >= ceilingDb) return 1;

  return (db - floorDb) / (ceilingDb - floorDb);
}

/**
 * Asymmetric smoothing: rise fast so the ring answers the voice, fall slowly
 * so it does not flicker between syllables. `previous` is the last displayed
 * level, `next` the newly measured one.
 */
export function smoothLevel(previous: number, next: number, attack = 0.6, release = 0.12): number {
  const from = Number.isFinite(previous) ? Math.max(0, Math.min(1, previous)) : 0;
  const to = Number.isFinite(next) ? Math.max(0, Math.min(1, next)) : 0;
  const coefficient = to > from ? attack : release;
  return from + (to - from) * Math.max(0, Math.min(1, coefficient));
}

/** Convenience: one recorded frame to one displayable level. */
export function levelFromFrame(samples: ArrayLike<number>, previous = 0): number {
  return smoothLevel(previous, rmsToLevel(frameRms(samples)));
}
