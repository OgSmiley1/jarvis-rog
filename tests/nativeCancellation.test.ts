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
