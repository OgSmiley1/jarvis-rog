import type { ModelRuntimeState, RunCompletionInput } from './types';

export function getModelRuntimeState(): ModelRuntimeState {
  return { status: 'error', error: 'Native local inference is unavailable on web.' };
}

export async function validateGguf(): Promise<never> {
  throw new Error('NATIVE_INFERENCE_UNAVAILABLE_ON_WEB');
}

export async function loadLocalModel(): Promise<never> {
  throw new Error('NATIVE_INFERENCE_UNAVAILABLE_ON_WEB');
}

export async function unloadLocalModel(): Promise<void> {}

export async function stopGeneration(): Promise<void> {}

export async function runCompletion(_input: RunCompletionInput): Promise<never> {
  throw new Error('NATIVE_INFERENCE_UNAVAILABLE_ON_WEB');
}
