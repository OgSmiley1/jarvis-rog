import { describe, expect, it } from 'vitest';
import { describeHud, deriveHudState, orbTapStartsVoice, type HudSignals } from '@/lib/hud/hudState';

const base: HudSignals = {
  modelStatus: 'ready',
  voiceState: 'IDLE',
  generating: false,
  speaking: false,
  toolRunning: false,
  handsFree: false,
  wakeWord: 'jarvis',
  sttReady: true,
  language: 'en',
};

describe('HUD state derivation', () => {
  it('reports what JARVIS is doing over what it can do', () => {
    expect(deriveHudState({ ...base, toolRunning: true, generating: true, speaking: true })).toBe('TOOL_RUNNING');
    expect(deriveHudState({ ...base, generating: true, speaking: true })).toBe('SPEAKING');
    expect(deriveHudState({ ...base, generating: true })).toBe('THINKING');
    expect(deriveHudState({ ...base, voiceState: 'TRANSCRIBING' })).toBe('LISTENING');
  });

  it('never reports READY for a model that is not loaded', () => {
    expect(deriveHudState({ ...base, modelStatus: 'unloaded' })).toBe('OFFLINE');
    expect(deriveHudState({ ...base, modelStatus: 'loading' })).toBe('PREPARING');
    expect(deriveHudState({ ...base, modelStatus: 'error' })).toBe('ERROR');
  });

  it('keeps a live voice session visible even while the model is faulted', () => {
    // The microphone is open; saying so matters more than the model's status.
    expect(deriveHudState({ ...base, modelStatus: 'error', voiceState: 'LISTENING' })).toBe('LISTENING');
  });

  it('names the owner-configured wake word in the hands-free prompt', () => {
    const hud = describeHud({ ...base, handsFree: true, wakeWord: 'Ammar' });
    expect(hud.detail).toContain('Ammar');
  });

  it('states that speech recognition is still preparing, with the measured progress', () => {
    const hud = describeHud({ ...base, sttReady: false, sttProgress: 0.42 });
    expect(hud.detail).toContain('42%');
  });

  it('omits a percentage when download progress was never reported', () => {
    const hud = describeHud({ ...base, sttReady: false, sttProgress: undefined });
    expect(hud.detail).not.toContain('%');
  });

  it('answers in Arabic when Arabic is selected', () => {
    const hud = describeHud({ ...base, language: 'ar', modelStatus: 'unloaded' });
    expect(hud.headline).toBe('غير متصل');
    expect(hud.detail).toContain('ضغطة واحدة');
  });

  it('never presents a brainless JARVIS as ready to help', () => {
    // The exact state observed on the owner's ROG (Build e6e0246): speech
    // recognition READY, orb LISTENING, `Model: Not selected`.
    const hud = describeHud({ ...base, modelStatus: 'unloaded', voiceState: 'LISTENING', handsFree: true });
    expect(hud.state).toBe('LISTENING');
    expect(hud.needsBrain).toBe(true);
    expect(hud.detail).toMatch(/cannot answer/i);
    expect(hud.detail).not.toContain('Say “jarvis”');
  });

  it('offers the brain whenever none is loaded, and only then', () => {
    expect(describeHud({ ...base, modelStatus: 'unloaded' }).needsBrain).toBe(true);
    expect(describeHud({ ...base, modelStatus: 'error' }).needsBrain).toBe(true);
    expect(describeHud({ ...base, modelStatus: 'loading' }).needsBrain).toBe(false);
    expect(describeHud({ ...base, modelStatus: 'ready' }).needsBrain).toBe(false);
  });

  it('points at the one-tap download instead of a file import', () => {
    const hud = describeHud({ ...base, modelStatus: 'unloaded' });
    expect(hud.detail).toMatch(/one tap/i);
    expect(hud.detail).not.toContain('GGUF');
  });

  it('starts a voice session from idle or error, and stops one otherwise', () => {
    expect(orbTapStartsVoice('IDLE')).toBe(true);
    expect(orbTapStartsVoice('ERROR')).toBe(true);
    expect(orbTapStartsVoice('LISTENING')).toBe(false);
    expect(orbTapStartsVoice('INITIALIZING')).toBe(false);
  });
});
