import { initLlama, releaseAllLlama, loadLlamaModelInfo } from 'llama.rn';
import { INTELLIGENCE_MODES } from './intelligenceModes';
import { requireNonBlankCompletion } from './inferenceResponse';
import type { ModelRuntimeState, RunCompletionInput, RuntimeMetrics } from './types';

let context: Awaited<ReturnType<typeof initLlama>> | null = null;
let state: ModelRuntimeState = { status: 'unloaded' };

export interface LoadModelOptions {
  contextSize?: number;
  batchSize?: number;
  threads?: number;
  gpuLayers?: number;
  useMlock?: boolean;
}

export function getModelRuntimeState(): ModelRuntimeState {
  return { ...state };
}

export async function validateGguf(path: string): Promise<unknown> {
  return loadLlamaModelInfo(path);
}

export async function loadLocalModel(
  modelPath: string,
  modelName: string,
  options: LoadModelOptions = {},
): Promise<ModelRuntimeState> {
  state = { status: 'loading', modelPath, modelName };
  try {
    if (context) {
      await releaseAllLlama();
      context = null;
    }

    await validateGguf(modelPath);
    context = await initLlama({
      model: modelPath,
      n_ctx: options.contextSize ?? 4096,
      n_batch: options.batchSize ?? 512,
      n_threads: options.threads ?? 6,
      n_gpu_layers: options.gpuLayers ?? 99,
      use_mmap: true,
      use_mlock: options.useMlock ?? false,
    });

    state = {
      status: 'ready',
      modelPath,
      modelName,
      gpu: context.gpu,
      reasonNoGPU: context.reasonNoGPU || undefined,
      devices: context.devices,
    };
    return getModelRuntimeState();
  } catch (error) {
    state = {
      status: 'error',
      modelPath,
      modelName,
      error: error instanceof Error ? error.message : String(error),
    };
    throw error;
  }
}

export async function unloadLocalModel(): Promise<void> {
  if (context) await releaseAllLlama();
  context = null;
  state = { status: 'unloaded' };
}

export async function stopGeneration(): Promise<void> {
  if (context) await context.stopCompletion();
}

export async function runCompletion(input: RunCompletionInput): Promise<{ text: string; metrics: RuntimeMetrics }> {
  if (!context) throw new Error('MODEL_NOT_LOADED');

  await context.clearCache(false);
  const mode = INTELLIGENCE_MODES[input.mode];
  const startedAt = performance.now();
  let firstTokenAt: number | undefined;
  let streamedTokens = 0;

  const result = await context.completion(
    {
      messages: input.messages,
      n_predict: mode.maxTokens,
      temperature: mode.temperature,
      top_p: mode.topP,
      top_k: mode.topK,
      stop: ['</s>', '<|end|>', '<|eot_id|>', '<|end_of_text|>', '<|im_end|>', '<|endoftext|>'],
    },
    (data) => {
      const token = data.token ?? '';
      if (token) {
        streamedTokens += 1;
        if (firstTokenAt === undefined) firstTokenAt = performance.now();
        input.onToken?.(token);
      }
    },
  );

  const endedAt = performance.now();
  const text = requireNonBlankCompletion(result.text);
  const nativeTimings = result.timings;
  const metrics: RuntimeMetrics = {
    totalMs: endedAt - startedAt,
    firstTokenMs: firstTokenAt === undefined ? undefined : firstTokenAt - startedAt,
    generatedTokens: streamedTokens || undefined,
    tokensPerSecond:
      typeof nativeTimings?.predicted_per_second === 'number'
        ? nativeTimings.predicted_per_second
        : streamedTokens > 0
          ? streamedTokens / ((endedAt - startedAt) / 1000)
          : undefined,
    nativeTimings,
  };

  return { text, metrics };
}
