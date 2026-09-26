import { initLlama, releaseAllLlama, loadLlamaModelInfo } from 'llama.rn';
import { INTELLIGENCE_MODES } from './intelligenceModes';
import { requireNonBlankCompletion } from './inferenceResponse';
import { createThinkFilter, stripThinking } from '@/lib/voice/stripThinking';
import { planRuntime, type DevicePowerState, type RuntimePlan } from './thermalPlan';
import type { ModelRuntimeState, RunCompletionInput, RuntimeMetrics } from './types';

let context: Awaited<ReturnType<typeof initLlama>> | null = null;
let state: ModelRuntimeState = { status: 'unloaded' };
let activePlan: RuntimePlan | null = null;

export interface LoadModelOptions {
  contextSize?: number;
  batchSize?: number;
  threads?: number;
  gpuLayers?: number;
  useMlock?: boolean;
  /**
   * Observed device thermal/power state. When supplied, the runtime is sized
   * for the hardware's current headroom instead of fixed defaults. Explicit
   * options above still win, so the owner can always override the plan.
   */
  device?: DevicePowerState;
}

/**
 * The runtime plan the loaded context was actually built with, or null when no
 * model is loaded. Diagnostics must read this rather than recomputing a plan,
 * so the UI reports what is running and not what would be chosen now.
 */
export function getActiveRuntimePlan(): RuntimePlan | null {
  return activePlan ? { ...activePlan } : null;
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

    // Size the runtime for the hardware's current headroom. With no device
    // readings this yields the previous fixed defaults, so behaviour is
    // unchanged until a real thermal signal arrives.
    const plan = planRuntime(options.device ?? {});
    const appliedPlan: RuntimePlan = {
      ...plan,
      contextSize: options.contextSize ?? plan.contextSize,
      batchSize: options.batchSize ?? plan.batchSize,
      threads: options.threads ?? plan.threads,
      gpuLayers: options.gpuLayers ?? plan.gpuLayers,
      reason:
        options.contextSize !== undefined ||
        options.batchSize !== undefined ||
        options.threads !== undefined ||
        options.gpuLayers !== undefined
          ? `${plan.reason}; explicit runtime overrides applied`
          : plan.reason,
    };
    context = await initLlama({
      model: modelPath,
      n_ctx: appliedPlan.contextSize,
      n_batch: appliedPlan.batchSize,
      n_threads: appliedPlan.threads,
      n_gpu_layers: appliedPlan.gpuLayers,
      use_mmap: true,
      use_mlock: options.useMlock ?? false,
    });
    activePlan = appliedPlan;

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
    activePlan = null;
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
  activePlan = null;
  state = { status: 'unloaded' };
}

export async function stopGeneration(): Promise<void> {
  if (context) await context.stopCompletion();
}

export async function runCompletion(input: RunCompletionInput): Promise<{ text: string; metrics: RuntimeMetrics }> {
  if (!context) throw new Error('MODEL_NOT_LOADED');

  const mode = INTELLIGENCE_MODES[input.mode];
  // Reasoning never reaches the screen or the voice: the chat template is told
  // not to think, and anything that still arrives inside <think> is dropped
  // from the stream here, before any caller sees a token.
  const thinkFilter = createThinkFilter();
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
      enable_thinking: input.thinking ?? false,
      ...(input.grammar ? { grammar: input.grammar } : {}),
    },
    (data) => {
      const token = data.token ?? '';
      if (!token) return;
      streamedTokens += 1;
      const visible = thinkFilter.push(token);
      if (visible) {
        if (firstTokenAt === undefined) firstTokenAt = performance.now();
        input.onToken?.(visible);
      }
    },
  );

  const tail = thinkFilter.end();
  if (tail) input.onToken?.(tail);
  const endedAt = performance.now();
  const text = requireNonBlankCompletion(stripThinking(result.text));
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
