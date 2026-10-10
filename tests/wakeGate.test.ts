import { describe, expect, it } from 'vitest';
import { toInt16 } from '@/lib/voice/pcm';
import { gateFrame, speechWindowOpen } from '@/lib/voice/wakeGate';
import { isComplete, looksLikeTflite, WAKE_MODEL_FILES } from '@/lib/voice/wakeModelFiles';

describe('wake-word gate', () => {
  it('asleep with the engine: only the engine hears — the room is not transcribed', () => {
    expect(gateFrame({ engineActive: true, accepting: true, awake: false })).toEqual({ toEngine: true, toSpeech: false });
  });
  it('awake: speech recognition hears the command, the engine keeps listening', () => {
    expect(gateFrame({ engineActive: true, accepting: true, awake: true })).toEqual({ toEngine: true, toSpeech: true });
  });
  it('lets a tap-to-talk request reach speech even while the wake engine is asleep', () => {
    expect(gateFrame({ engineActive: true, accepting: true, awake: speechWindowOpen(true, 0, 100) })).toEqual({ toEngine: true, toSpeech: true });
    expect(speechWindowOpen(false, 0, 100)).toBe(false);
  });
  it('without the engine, behaviour is unchanged: everything goes to speech recognition', () => {
    expect(gateFrame({ engineActive: false, accepting: true, awake: false })).toEqual({ toEngine: false, toSpeech: true });
  });
  it('while JARVIS speaks nothing is heard (no self-triggering, no echo transcription)', () => {
    expect(gateFrame({ engineActive: true, accepting: false, awake: true })).toEqual({ toEngine: false, toSpeech: false });
  });
});

describe('PCM conversion', () => {
  it('maps float to 16-bit and clamps', () => {
    expect(Array.from(toInt16(new Float32Array([0, 1, -1, 2, -2])))).toEqual([0, 32767, -32768, 32767, -32768]);
  });
});

describe('wake-word model files', () => {
  const tfl3 = new Uint8Array([0x1c, 0, 0, 0, 0x54, 0x46, 0x4c, 0x33]);
  it('accept only the exact published TFLite file', () => {
    const jarvis = WAKE_MODEL_FILES.find((file) => file.role === 'wakeWord')!;
    expect(isComplete(jarvis, jarvis.bytes, tfl3)).toBe(true);
    expect(isComplete(jarvis, jarvis.bytes - 1, tfl3)).toBe(false);
    expect(looksLikeTflite(new TextEncoder().encode('<!DOCTYPE html>'))).toBe(false);
  });
  it('cover the three files the engine needs', () => {
    expect(WAKE_MODEL_FILES.map((file) => file.role).sort()).toEqual(['embedding', 'melspec', 'wakeWord']);
  });
});
