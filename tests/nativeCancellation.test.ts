import { beforeEach, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({ completion: vi.fn(), stopCompletion: vi.fn(async () => undefined), release: vi.fn(async () => undefined) }));
vi.mock('llama.rn', () => ({ initLlama: vi.fn(async () => native), loadLlamaModelInfo: vi.fn(async () => ({})) }));
import { loadLocalModel, runCompletion } from '../lib/inference/standaloneModel.native';
beforeEach(async () => { vi.clearAllMocks(); await loadLocalModel('/model.gguf', 'test'); });
it('stops native generation and discards tokens and results after cancellation', async () => {
  const controller = new AbortController();
  let finish!: (value: { text: string }) => void;
  native.completion.mockImplementationOnce((_options, token) => new Promise(resolve => {
    finish = resolve;
    controller.signal.addEventListener('abort', () => token({ token: 'late words' }));
  }));
  const onToken = vi.fn();
  const pending = runCompletion({ messages: [], mode: 'fast', signal: controller.signal, onToken });
  controller.abort(); finish({ text: 'late words' });
  await expect(pending).rejects.toThrow('TURN_CANCELLED');
  expect(native.stopCompletion).toHaveBeenCalledOnce();
  expect(onToken).not.toHaveBeenCalled();
});
it('rejects expired turns before native execution and respects a spoken token cap', async () => {
  await expect(runCompletion({ messages: [], mode: 'fast', deadlineAt: Date.now() - 1 })).rejects.toThrow('TURN_DEADLINE');
  expect(native.completion).not.toHaveBeenCalled();
  native.completion.mockResolvedValueOnce({ text: 'Hello.' });
  await runCompletion({ messages: [], mode: 'fast', maxTokens: 128 });
  expect(native.completion.mock.calls[0]![0].n_predict).toBe(128);
});

it('deduplicates simultaneous initialization of the same model', async () => {
  const { initLlama } = await import('llama.rn');
  vi.mocked(initLlama).mockClear();
  const first = loadLocalModel('/same.gguf', 'same');
  const second = loadLocalModel('/same.gguf', 'same');
  expect(first).toBe(second);
  await Promise.all([first, second]);
  expect(initLlama).toHaveBeenCalledOnce();
});

it('keeps the model selection visible after native loading fails and permits retry', async () => {
  const { initLlama } = await import('llama.rn');
  const { getModelRuntimeState } = await import('../lib/inference/standaloneModel.native');
  vi.mocked(initLlama).mockRejectedValueOnce(new Error('not enough memory'));
  await expect(loadLocalModel('/retained.gguf', 'retained')).rejects.toThrow('not enough memory');
  expect(getModelRuntimeState()).toMatchObject({ status: 'error', modelPath: '/retained.gguf' });
  expect(await loadLocalModel('/retained.gguf', 'retained')).toMatchObject({ status: 'ready', modelPath: '/retained.gguf' });
});
