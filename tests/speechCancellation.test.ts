import { beforeEach, expect, it, vi } from 'vitest';
const engine = vi.hoisted(() => ({
  enumerate: vi.fn<() => Promise<never[]>>(),
  speak: vi.fn(),
  stop: vi.fn(async () => undefined),
}));
vi.mock('expo-speech', () => ({
  getAvailableVoicesAsync: engine.enumerate,
  speak: engine.speak,
  stop: engine.stop,
}));
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

it('Stop prevents a queued sentence from resuming after delayed voice selection', async () => {
  let release!: (voices: never[]) => void;
  engine.enumerate.mockReturnValue(new Promise((resolve) => { release = resolve; }));
  const { speakQueued, stopSpeaking } = await import('@/lib/voice/voiceResponse');
  const pending = speakQueued('Old sentence.', 'en');
  await stopSpeaking();
  release([]);
  await pending;
  expect(engine.speak).not.toHaveBeenCalled();
});

it('Stop also prevents a whole answer from resuming after voice selection', async () => {
  let release!: (voices: never[]) => void;
  engine.enumerate.mockReturnValue(new Promise((resolve) => { release = resolve; }));
  const { speakResponse, stopSpeaking } = await import('@/lib/voice/voiceResponse');
  const pending = speakResponse('Old answer.', 'en');
  await vi.waitFor(() => expect(engine.enumerate).toHaveBeenCalled());
  await stopSpeaking();
  release([]);
  await pending;
  expect(engine.speak).not.toHaveBeenCalled();
});
