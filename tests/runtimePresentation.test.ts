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
    expect(playing.detail).not.toContain('permission');
    const done = describeRuntime({ ...ready, speaking: false });
    expect(done.coreState).toBe('idle');
    expect(done.detail).not.toContain('Speaking');
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
