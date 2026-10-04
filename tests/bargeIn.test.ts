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

import { bargeInDecision, echoOverlap } from '@/lib/voice/bargeIn';

describe('talk over JARVIS (beta) — the echo guard', () => {
  const spoken = ['It is 31 degrees in Ajman with a light breeze.', 'Tomorrow will be hotter.'];

  it('JARVIS hearing its own voice is echo and never interrupts', () => {
    expect(echoOverlap('31 degrees in Ajman', spoken)).toBe(1);
    expect(bargeInDecision({ speaking: true, echoSafe: true, transcript: 'with a light breeze', spokenRecent: spoken })).toBe('ignore');
  });

  it('the owner talking over it interrupts', () => {
    expect(bargeInDecision({ speaking: true, echoSafe: true, transcript: 'what about Dubai', spokenRecent: spoken })).toBe('interrupt');
    expect(bargeInDecision({ speaking: true, echoSafe: true, transcript: 'stop', spokenRecent: spoken })).toBe('interrupt');
    expect(bargeInDecision({ speaking: true, echoSafe: true, transcript: 'وقف يا جارفيس', spokenRecent: spoken })).toBe('interrupt');
  });

  it('a halt word JARVIS itself just said is echo, not an order', () => {
    expect(bargeInDecision({ speaking: true, echoSafe: true, transcript: 'enough', spokenRecent: ['That is enough for today.'] })).toBe('ignore');
  });

  it('off unless switched on', () => {
    expect(bargeInDecision({ speaking: true, echoSafe: false, transcript: 'what about Dubai', spokenRecent: spoken })).toBe('ignore');
  });
});
