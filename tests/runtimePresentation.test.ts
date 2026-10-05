import { describe, expect, it } from 'vitest';
import { describeRuntime, type RuntimeSignals } from '@/lib/runtime/presentation';
import { coreColorFor } from '@/lib/core/CorePresets';
const ready: RuntimeSignals = { modelStatus: 'ready', voiceState: 'IDLE', generating: false, speaking: false, toolRunning: false, handsFree: false, wakeWord: 'jarvis', sttReady: true, language: 'en', busy: false, localOnly: false, downloading: false, microphone: 'granted' };
describe('one rendered runtime state', () => {
  it('ignores stale working and local-inference flags after cancellation', () => {
    const stopped = describeRuntime({ ...ready, phase: 'interrupted', generating: true, toolRunning: true });
    expect(stopped).toMatchObject({ coreState: 'interrupted', isBusy: false, headline: 'STOPPED' });
    expect(describeRuntime({ ...ready, phase: 'local_inference' })).toMatchObject({ coreState: 'idle', isBusy: false });
  });
  it('speaking follows playback rather than queued synthesis or stale permission errors', () => {
    const playing = describeRuntime({ ...ready, speaking: true, busy: true, phase: 'local_inference', voiceState: 'ERROR', microphone: 'denied', voiceError: 'permission denied' });
    expect(playing.coreState).toBe('speaking');
    expect(playing.isBusy).toBe(false);
    expect(playing.detail).not.toContain('permission');
    const done = describeRuntime({ ...ready, speaking: false });
    expect(done.coreState).toBe('idle');
    expect(done.detail).not.toContain('Speaking');
  });
  it('keeps microphone startup distinct from confirmed listening', () => {
    for (const voiceState of ['REQUESTING_PERMISSION', 'INITIALIZING'] as const) {
      expect(describeRuntime({ ...ready, voiceState })).toMatchObject({ state: 'PREPARING', headline: 'STARTING MICROPHONE', micActive: false });
    }
    expect(describeRuntime({ ...ready, voiceState: 'LISTENING' })).toMatchObject({ state: 'LISTENING', micActive: true });
  });
  it('does not claim listening or speaking while audio is suppressed for queued synthesis', () => {
    expect(describeRuntime({ ...ready, voiceState: 'LISTENING', speechQueued: true })).toMatchObject({ state: 'PREPARING', headline: 'PREPARING REPLY', micActive: false, isBusy: false });
    expect(describeRuntime({ ...ready, speechQueued: true, speaking: true })).toMatchObject({ state: 'SPEAKING', micActive: false });
  });
  it('does not replace a failed request with a stale microphone error', () => {
    const failed = describeRuntime({ ...ready, phase: 'error', voiceState: 'ERROR', microphone: 'denied', voiceError: 'permission denied' });
    expect(failed.detail).toContain('request failed');
    expect(failed.detail).not.toContain('permission');
  });
  it('can show a turn warning without suggesting microphone repair', () => {
    const warning = describeRuntime({ ...ready, phase: 'warning' });
    expect(warning).toMatchObject({ coreState: 'warning', headline: 'WARNING', isBusy: false });
    expect(warning.detail).not.toContain('Microphone');
  });
  it('never claims listening without granted microphone permission', () => {
    expect(describeRuntime({ ...ready, voiceState: 'LISTENING', microphone: 'denied' }).micActive).toBe(false);
    expect(describeRuntime({ ...ready, voiceState: 'ERROR', microphone: 'blocked' })).toMatchObject({ coreState: 'warning', micActive: false });
  });
  it('tracks the live turn, then playback, then an interrupt replacement', () => {
    expect(describeRuntime({ ...ready, busy: true, phase: 'online_lookup' }).coreState).toBe('online_lookup');
    expect(describeRuntime({ ...ready, busy: true, phase: 'tool_execution' }).coreState).toBe('tool_execution');
    expect(describeRuntime({ ...ready, speaking: true }).coreState).toBe('speaking');
    expect(describeRuntime({ ...ready, voiceState: 'LISTENING', phase: 'interrupted' }).coreState).toBe('listening');
  });
  it('separates loading, downloading and Local Only without treating Local Only as an error', () => {
    expect(describeRuntime({ ...ready, modelStatus: 'loading' }).coreState).toBe('model_loading');
    expect(describeRuntime({ ...ready, downloading: true }).coreState).toBe('model_downloading');
    expect(describeRuntime({ ...ready, localOnly: true })).toMatchObject({ coreState: 'local_only', state: 'READY' });
    expect(coreColorFor('local_only')).toBe(coreColorFor('idle'));
    expect(coreColorFor('error')).not.toBe(coreColorFor('idle'));
    expect(coreColorFor('warning')).not.toBe(coreColorFor('error'));
  });
});
