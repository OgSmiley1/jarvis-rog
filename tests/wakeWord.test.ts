import { describe, expect, it } from 'vitest';
import { extractWakeCommand } from '@/lib/voice/wakeWord';

describe('extractWakeCommand', () => {
  it('extracts an English command after Jarvis', () => {
    expect(extractWakeCommand('Jarvis, open email')).toEqual({ heard: true, command: 'open email' });
  });

  it('recognizes common Arabic spellings', () => {
    expect(extractWakeCommand('يا جارفس افتح الخريطة')).toEqual({ heard: true, command: 'افتح الخريطة' });
  });

  it('allows a custom wake word', () => {
    expect(extractWakeCommand('Shadow check maps', 'shadow')).toEqual({ heard: true, command: 'check maps' });
  });

  it('returns no wake word for ordinary speech', () => {
    expect(extractWakeCommand('open email')).toEqual({ heard: false, command: '' });
  });

  it('does not trigger when Jarvis is only mentioned in the middle of speech', () => {
    expect(extractWakeCommand('tell me whether Jarvis can open email')).toEqual({ heard: false, command: '' });
  });

  it('accepts a short greeting before the wake word', () => {
    expect(extractWakeCommand('Hey Jarvis open YouTube')).toEqual({ heard: true, command: 'open YouTube' });
  });
});
