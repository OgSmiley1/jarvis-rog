import { describe, expect, it } from 'vitest';
import { haltAcknowledgement, isHaltCommand } from '@/lib/voice/bargeIn';

describe('voice barge-in', () => {
  it('recognises a bare halt in English and Arabic', () => {
    for (const phrase of ['stop', 'Stop.', 'be quiet', 'shut up', 'enough', 'توقف', 'اسكت', 'خلاص']) {
      expect(isHaltCommand(phrase), phrase).toBe(true);
    }
  });

  it('recognises a halt addressed to JARVIS by name', () => {
    expect(isHaltCommand('Jarvis, stop')).toBe(true);
    expect(isHaltCommand('جارفيس توقف')).toBe(true);
  });

  it('does not hijack a sentence that merely contains a halt word', () => {
    for (const phrase of [
      'stop the car at the roundabout',
      'when does the bus stop running',
      'cancel my meeting tomorrow',
      'توقف السيارة عند الدوار',
    ]) {
      expect(isHaltCommand(phrase), phrase).toBe(false);
    }
  });

  it('ignores empty or whitespace-only input', () => {
    expect(isHaltCommand('')).toBe(false);
    expect(isHaltCommand('   ')).toBe(false);
    expect(isHaltCommand('jarvis')).toBe(false);
  });

  it('acknowledges in the owner-selected language', () => {
    expect(haltAcknowledgement('ar')).toBe('حاضر.');
    expect(haltAcknowledgement('en')).toBe('Standing down.');
  });
});
